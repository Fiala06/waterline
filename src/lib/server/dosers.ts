// A doser's doses (#196): kept with the doser as its settings (the equipment
// form), listed where its equipment is, and logged in History by the scheduler
// at their time, in the owner's time zone, as doses like any other: a dosing
// reminder for the same product is marked done by one, and the tasks that
// follow a dose move with it.
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { doseDue, doseLabel, dosesLabel, startFrom, type DoseSpec } from '$lib/dosers';
import { equipmentName } from '$lib/equipment';
import { logCompletes } from '$lib/tasks';
import { utcToZoned, zonedToUtc } from '$lib/time';
import { db } from './db';
import { autoDoses, equipment, events, tanks, tasks, users, type AutoDose, type Equipment, type User } from './db/schema';
import { logger } from './log';
import { completeTask, followLog, isPaused, lastDoneOn } from './tasks';

/** A dose as the form gives it: an existing row's id, or null for a new one. */
export interface DoseInput extends DoseSpec {
	id: string | null;
}

/** A doser's doses, in the order the keeper put them. */
export function listDoses(equipmentId: string): AutoDose[] {
	return db.select().from(autoDoses).where(eq(autoDoses.equipmentId, equipmentId)).orderBy(asc(autoDoses.position), asc(autoDoses.createdAt)).all();
}

/** The doses of each doser still in a tank, by the doser's id. */
export function dosesByEquipment(tankId: string): Map<string, AutoDose[]> {
	const rows = db
		.select({ dose: autoDoses })
		.from(autoDoses)
		.innerJoin(equipment, eq(equipment.id, autoDoses.equipmentId))
		.where(and(eq(autoDoses.tankId, tankId), isNull(equipment.removedAt)))
		.orderBy(asc(autoDoses.position), asc(autoDoses.createdAt))
		.all();
	const out = new Map<string, AutoDose[]>();
	for (const { dose } of rows) out.set(dose.equipmentId, [...(out.get(dose.equipmentId) ?? []), dose]);
	return out;
}

/** Every dose of a tank's dosers (in the tank), each with its doser: "Thrive+ 1 mL at 10:00 every day" for the growing setup and the summary. */
export function autoDoseLines(tankId: string): { itemId: string; item: string; text: string; dose: AutoDose }[] {
	const items = new Map(
		db
			.select()
			.from(equipment)
			.where(and(eq(equipment.tankId, tankId), eq(equipment.type, 'doser'), isNull(equipment.removedAt)))
			.all()
			.map((e) => [e.id, e])
	);
	return [...dosesByEquipment(tankId).entries()].flatMap(([itemId, list]) => {
		const e = items.get(itemId);
		return e ? list.map((dose) => ({ itemId, item: equipmentName(e), text: doseLabel(dose), dose })) : [];
	});
}

/** The doses a tank's dosers have logged, for an export. */
export function dosesOfTanks(tankIds: string[]): AutoDose[] {
	return tankIds.length ? db.select().from(autoDoses).where(inArray(autoDoses.tankId, tankIds)).orderBy(asc(autoDoses.position)).all() : [];
}

/**
 * Keep a doser's doses as the form has them: rows by id are changed, new ones
 * added, the rest removed. A dose made, moved to another time or resumed starts
 * from its next time (startFrom), so a dose set up after its time isn't logged
 * for a day the doser may not have made it. When what it doses changes, History
 * gets a line, as a light's schedule does (#25).
 */
export function syncDoses(user: User, e: Equipment, input: DoseInput[], now = new Date()) {
	const before = listDoses(e.id);
	const local = utcToZoned(now, user.timeZone);
	const keep = new Set<string>();
	db.transaction((tx) => {
		input.forEach((row, i) => {
			const prev = row.id ? before.find((d) => d.id === row.id) : undefined;
			const fields = { product: row.product, amountMl: row.amountMl, at: row.at, seconds: row.seconds, weekdays: row.weekdays, paused: row.paused, position: i };
			if (prev) {
				keep.add(prev.id);
				const restart = prev.at !== row.at || (prev.paused && !row.paused);
				tx.update(autoDoses)
					.set({ ...fields, lastLoggedOn: restart ? startFrom(row, local, prev.lastLoggedOn) : prev.lastLoggedOn })
					.where(eq(autoDoses.id, prev.id))
					.run();
			} else {
				const made = tx
					.insert(autoDoses)
					.values({ ...fields, tankId: e.tankId, equipmentId: e.id, lastLoggedOn: startFrom(row, local, null) })
					.returning()
					.get();
				keep.add(made.id);
			}
		});
		const gone = before.filter((d) => !keep.has(d.id)).map((d) => d.id);
		if (gone.length) tx.delete(autoDoses).where(inArray(autoDoses.id, gone)).run();
	});
	const was = dosesLabel(before);
	const after = dosesLabel(listDoses(e.id));
	if (was !== after) {
		db.insert(events)
			.values({
				tankId: e.tankId,
				category: 'equipment',
				occurredAt: now.toISOString(),
				note: null,
				data: { action: 'doses', equipment_id: e.id, item: equipmentName(e), doses: after, was, changes: { doses: [was, after] } }
			})
			.run();
	}
}

/** What a doser has logged, newest first, for its page. */
export function dosesLoggedBy(equipmentId: string, limit = 10) {
	return db
		.select()
		.from(events)
		.where(and(eq(events.category, 'dosing'), sql`json_extract(${events.data}, '$.doser_id') = ${equipmentId}`))
		.orderBy(desc(events.occurredAt))
		.limit(limit)
		.all();
}

/**
 * The scheduler's run (every 5 minutes): each dose whose time has come today,
 * on one of its days, in the owner's time zone, is logged once, at its time.
 * Removed dosers and archived tanks dose nothing here.
 */
export async function logDueDoses(now = new Date()): Promise<number> {
	const rows = db
		.select({ dose: autoDoses, item: equipment, tank: tanks, user: users })
		.from(autoDoses)
		.innerJoin(equipment, eq(equipment.id, autoDoses.equipmentId))
		.innerJoin(tanks, eq(tanks.id, autoDoses.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(and(eq(autoDoses.paused, false), isNull(equipment.removedAt), isNull(tanks.archivedAt)))
		.all();
	let logged = 0;
	for (const r of rows) {
		const local = utcToZoned(now, r.user.timeZone);
		if (!doseDue(r.dose, local)) continue;
		try {
			logDose(r.user, r.item, r.dose, local.date);
			logged++;
		} catch (e) {
			logger.error('server', "A doser's dose couldn't be logged", { tankId: r.tank.id, equipmentId: r.item.id, error: e });
		}
	}
	return logged;
}

/**
 * One dose, logged for a day at its time: a dosing entry that says the doser
 * made it, the dosing reminder for its product done by it (as a dose logged by
 * hand does, #167), and the tasks that follow a dose due from it (#178).
 */
function logDose(user: User, item: Equipment, dose: AutoDose, date: string) {
	const tz = user.timeZone;
	const at = zonedToUtc(date, dose.at, tz).toISOString();
	const event = db.transaction((tx) => {
		const made = tx
			.insert(events)
			.values({
				tankId: dose.tankId,
				category: 'dosing',
				occurredAt: at,
				note: null,
				data: { product: dose.product, amount: dose.amountMl, unit: 'mL', auto: true, doser_id: item.id, dose_id: dose.id }
			})
			.returning()
			.get();
		tx.update(autoDoses).set({ lastLoggedOn: date }).where(eq(autoDoses.id, dose.id)).run();
		return made;
	});
	const product = dose.product.trim().toLowerCase();
	const routine = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, dose.tankId), eq(tasks.kind, 'dosing'), isNotNull(tasks.nextDue), sql`lower(trim(coalesce(${tasks.product}, ${tasks.name}))) = ${product}`))
		.all()
		.find((t) => !isPaused(t, date) && logCompletes(t, lastDoneOn(t.id, tz), date));
	const done = routine ? completeTask(user.id, routine.id, { at, eventId: event.id, timeZone: tz }) : null;
	if (done?.scheduleMode !== 'after') followLog(dose.tankId, { kind: 'dosing', date, product: dose.product, id: event.id }, tz, done?.id);
	return event;
}
