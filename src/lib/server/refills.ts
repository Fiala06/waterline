// CO₂ cylinder refills (#368): each refill is a History entry on the CO₂ item
// (equipment, action "refilled"), and how long a fill lasts is worked out from
// those entries when it's read, so one deleted or logged late counts as it
// stands. A cost goes to Spending, linked to the item. The alert is the
// item's own switch, off until turned on.
import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { refillKey, type RefillAlert } from '$lib/alerts';
import { equipmentName } from '$lib/equipment';
import { fillText, refillDue, refillStats, type RefillStats } from '$lib/refills';
import { dateInZone, fmtDate, todayInZone, zonedToUtc } from '$lib/time';
import { db } from './db';
import { equipment, events, type Equipment, type Event, type User } from './db/schema';
import { addExpense } from './expenses';
import { requireRoleOn } from './members';
import { getEquipment } from './specs';

const isRefill = sql`json_extract(${events.data}, '$.action') = 'refilled'`;
const itemOf = (e: Event) => (typeof e.data.equipment_id === 'string' ? e.data.equipment_id : '');

/** The refills logged for these tanks' items, oldest first, by the item. */
function refillsByItem(tankIds: string[]): Map<string, Event[]> {
	if (!tankIds.length) return new Map();
	const rows = db
		.select()
		.from(events)
		.where(and(inArray(events.tankId, tankIds), eq(events.category, 'equipment'), isRefill))
		.orderBy(asc(events.occurredAt))
		.all();
	return Map.groupBy(rows, itemOf);
}

/** One item's refills, oldest first. */
export function refillsOf(e: Pick<Equipment, 'id' | 'tankId'>): Event[] {
	return refillsByItem([e.tankId]).get(e.id) ?? [];
}

/** How long a fill lasts for each CO₂ item of a tank that has a refill logged, by the item. */
export function refillStatsFor(tankId: string, timeZone: string): Map<string, RefillStats> {
	return new Map([...refillsByItem([tankId])].map(([id, rows]) => [id, refillStats(rows.map((r) => dateInZone(r.occurredAt, timeZone)))]));
}

/** The CO₂ item a refill is logged on: in the tank, not removed, and the keeper can log to it. */
export function refillItem(userId: string, tankId: string, id: string): Equipment {
	const e = getEquipment(userId, id);
	if (e.tankId !== tankId || e.type !== 'co2') error(404, 'Equipment not found');
	return e;
}

/**
 * The cylinder was refilled on `day` (the keeper's date): a History entry, and
 * its cost, if given, in Spending. A day already logged is turned down, so a
 * second tap isn't a second refill.
 */
export function logRefill(user: User, e: Equipment, input: { day: string; note: string | null; costCents: number | null }): Event | { error: string } {
	requireRoleOn(user.id, e.tankId, 'log');
	if (e.removedAt) error(400, 'That equipment was removed');
	const today = todayInZone(user.timeZone);
	if (refillsOf(e).some((r) => dateInZone(r.occurredAt, user.timeZone) === input.day)) return { error: 'A refill is already logged for that day.' };
	// today's is logged now; an earlier day's at noon, the keeper's time
	const at = input.day === today ? new Date().toISOString() : zonedToUtc(input.day, '12:00', user.timeZone).toISOString();
	return db.transaction(() => {
		const event = db
			.insert(events)
			.values({ tankId: e.tankId, category: 'equipment', occurredAt: at, note: input.note, data: { action: 'refilled', equipment_id: e.id, item: equipmentName(e) }, loggedBy: user.id })
			.returning()
			.get();
		if (input.costCents != null)
			addExpense(user.id, e.tankId, { date: input.day, amountCents: input.costCents, category: 'consumables', what: 'CO₂ refill', note: null, equipmentId: e.id, currency: user.currency });
		return event;
	});
}

/** The alert on or off, for an item the keeper can log to. */
export function setRefillAlert(userId: string, e: Equipment, on: boolean) {
	requireRoleOn(userId, e.tankId, 'log');
	db.update(equipment).set({ refillAlert: on }).where(eq(equipment.id, e.id)).run();
}

/** Cylinders likely running low (#368), of these tanks, with their alert on: for the bell and Alerts. */
export function refillAlerts(user: Pick<User, 'timeZone'>, tanks: { id: string; name: string }[], today = todayInZone(user.timeZone)): RefillAlert[] {
	if (!tanks.length) return [];
	const watched = db
		.select()
		.from(equipment)
		.where(and(inArray(equipment.tankId, tanks.map((t) => t.id)), eq(equipment.type, 'co2'), eq(equipment.refillAlert, true), isNull(equipment.removedAt)))
		.all();
	if (!watched.length) return [];
	const refills = refillsByItem([...new Set(watched.map((e) => e.tankId))]);
	return watched.flatMap((e) => {
		const s = refillStats((refills.get(e.id) ?? []).map((r) => dateInZone(r.occurredAt, user.timeZone)));
		if (!refillDue(s, today)?.low) return [];
		const tankName = tanks.find((t) => t.id === e.tankId)!.name;
		return [
			{
				kind: 'refill' as const,
				// until it's refilled again
				key: refillKey(e.id, s.last!),
				tankId: e.tankId,
				tankName,
				equipmentId: e.id,
				title: `${equipmentName(e)}: cylinder likely running low`,
				sub: `${tankName} · last refilled ${fmtDate(s.last!)} · ${fillText(s)}`,
				href: `/tanks/${e.tankId}/equipment/${e.id}/refills`
			}
		];
	});
}
