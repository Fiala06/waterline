import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { eventTitle } from '$lib/events';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-dosers-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { autoDoses, equipment, events, tanks, users } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, removeEquipment } = await import('./specs');
const { createTask, getTask } = await import('./tasks');
const { autoDoseLines, dosesByEquipment, dosesLoggedBy, listDoses, logDueDoses, syncDoses } = await import('./dosers');

// a keeper in Los Angeles: 10:00 there is 17:00Z in October (PDT)
const user = (() => {
	const u = upsertUser({ email: 'dosers@example.com', name: 'Keeper' });
	return db.update(users).set({ timeZone: 'America/Los_Angeles' }).where(eq(users.id, u.id)).returning().get();
})();
const tz = user.timeZone;
const tank = createTank(user, { name: 'Doser tank', type: 'planted', nominalVolumeL: 100 });
const doser = addEquipment(user.id, tank.id, { type: 'doser', brand: 'Kamoer', model: 'X1', specs: { heads: 1 }, installedAt: '2026-10-01', notes: null }, tz);
const thrive = { id: null, product: 'Thrive+', amountMl: 1, at: '10:00', seconds: 30, weekdays: null, paused: false };
// Monday Oct 19 2026 in Los Angeles, before and after 10:00
const monday0955 = new Date('2026-10-19T16:55:00Z');
const monday1002 = new Date('2026-10-19T17:02:00Z');
const dosesLogged = (tankId: string) => db.select().from(events).where(and(eq(events.tankId, tankId), eq(events.category, 'dosing'))).all();
const dosesChanges = (tankId: string) =>
	db.select().from(events).where(and(eq(events.tankId, tankId), eq(events.category, 'equipment'))).all().filter((e) => e.data.action === 'doses');

describe("a doser's doses (#196)", () => {
	it('are kept with the doser from the form, and History says what it doses', () => {
		syncDoses(user, doser, [thrive], monday0955);
		const [d] = listDoses(doser.id);
		expect(d).toMatchObject({ tankId: tank.id, equipmentId: doser.id, product: 'Thrive+', amountMl: 1, at: '10:00', seconds: 30, weekdays: null, paused: false, position: 0 });
		// set up before its time today: logged from today
		expect(d.lastLoggedOn).toBeNull();
		const [change] = dosesChanges(tank.id);
		expect(eventTitle(change, user)).toBe('Kamoer X1 doses Thrive+ 1 mL at 10:00 every day · runs 30 s');
		expect(change.data).toMatchObject({ equipment_id: doser.id, was: 'nothing' });
		expect(dosesByEquipment(tank.id).get(doser.id)).toHaveLength(1);
		expect(autoDoseLines(tank.id)).toEqual([expect.objectContaining({ itemId: doser.id, item: 'Kamoer X1', text: 'Thrive+ 1 mL at 10:00 every day · runs 30 s' })]);
	});

	it('are logged in History at their time, once a day, as doses the doser made', async () => {
		expect(await logDueDoses(monday0955)).toBe(0);
		expect(await logDueDoses(monday1002)).toBe(1);
		const [dose] = dosesLogged(tank.id);
		expect(dose.occurredAt).toBe('2026-10-19T17:00:00.000Z');
		expect(dose.data).toEqual({ product: 'Thrive+', amount: 1, unit: 'mL', auto: true, doser_id: doser.id, dose_id: listDoses(doser.id)[0].id });
		expect(eventTitle(dose, user)).toBe('Dosed Thrive+ · 1 mL');
		expect(listDoses(doser.id)[0].lastLoggedOn).toBe('2026-10-19');
		// later the same day: nothing more; the next day: the next one
		expect(await logDueDoses(new Date('2026-10-19T23:30:00Z'))).toBe(0);
		expect(await logDueDoses(new Date('2026-10-20T17:30:00Z'))).toBe(1);
		expect(dosesLogged(tank.id)).toHaveLength(2);
		expect(dosesLoggedBy(doser.id).map((e) => e.occurredAt)).toEqual(['2026-10-20T17:00:00.000Z', '2026-10-19T17:00:00.000Z']);
	});

	it('are not logged on other days, while paused, or once the doser is gone', async () => {
		const t = createTank(user, { name: 'Days tank', type: 'planted', nominalVolumeL: 60 });
		const d = addEquipment(user.id, t.id, { type: 'doser', brand: 'Jebao', model: 'Doser 3.4', specs: {}, installedAt: null, notes: null }, tz);
		// the other tanks' dosers log too, so count this tank's
		const after = async (now: string) => {
			await logDueDoses(new Date(now));
			return dosesLogged(t.id).length;
		};
		// Mon, Wed, Fri: Tuesday Oct 20 has none, Wednesday does
		syncDoses(user, d, [{ ...thrive, product: 'Excel', weekdays: '1,3,5' }], monday0955);
		expect(await after('2026-10-20T17:30:00Z')).toBe(0);
		expect(await after('2026-10-21T17:30:00Z')).toBe(1);
		// paused: nothing, and resumed after its time it starts from the next one
		const [row] = listDoses(d.id);
		syncDoses(user, d, [{ ...thrive, id: row.id, product: 'Excel', weekdays: '1,3,5', paused: true }], new Date('2026-10-22T17:30:00Z'));
		expect(await after('2026-10-23T17:30:00Z')).toBe(1);
		syncDoses(user, d, [{ ...thrive, id: row.id, product: 'Excel', weekdays: '1,3,5' }], new Date('2026-10-23T18:00:00Z'));
		expect(listDoses(d.id)[0].lastLoggedOn).toBe('2026-10-23');
		expect(await after('2026-10-23T18:30:00Z')).toBe(1);
		expect(await after('2026-10-26T17:30:00Z')).toBe(2);
		// removed: no more
		removeEquipment(user.id, d.id);
		expect(await after('2026-10-28T17:30:00Z')).toBe(2);
		expect(dosesByEquipment(t.id).size).toBe(0);
		// an archived tank: no more either
		const t2 = createTank(user, { name: 'Old tank', type: 'planted', nominalVolumeL: 60 });
		const d2 = addEquipment(user.id, t2.id, { type: 'doser', brand: 'Kamoer', model: 'X4', specs: {}, installedAt: null, notes: null }, tz);
		syncDoses(user, d2, [thrive], monday0955);
		db.update(tanks).set({ archivedAt: new Date().toISOString() }).where(eq(tanks.id, t2.id)).run();
		await logDueDoses(new Date('2026-10-30T17:30:00Z'));
		expect(dosesLogged(t2.id)).toHaveLength(0);
	});

	it("marks the product's dosing reminder done and moves the tasks that follow a dose", async () => {
		const t = createTank(user, { name: 'Routine tank', type: 'planted', nominalVolumeL: 60 });
		const d = addEquipment(user.id, t.id, { type: 'doser', brand: 'Kamoer', model: 'X1', specs: {}, installedAt: null, notes: null }, tz);
		syncDoses(user, d, [thrive], monday0955);
		const routine = createTask(user.id, t.id, { name: 'Dose Thrive+', kind: 'dosing', product: 'thrive+', amount: 1, amountUnit: 'mL', recurring: true, intervalDays: 1, scheduleMode: 'completion', nextDue: '2026-10-19', openFormOnDone: false });
		const other = createTask(user.id, t.id, { name: 'Dose Excel', kind: 'dosing', product: 'Excel', amount: 2, amountUnit: 'mL', recurring: true, intervalDays: 1, scheduleMode: 'completion', nextDue: '2026-10-19', openFormOnDone: false });
		const follower = createTask(user.id, t.id, { name: 'Test nitrate', kind: 'test', recurring: true, intervalDays: null, scheduleMode: 'after', nextDue: null, openFormOnDone: false, triggerKind: 'dosing', triggerOffsetDays: 1, triggerProduct: 'Thrive+' });
		expect(await logDueDoses(monday1002)).toBe(1);
		const [dose] = dosesLogged(t.id);
		expect(getTask(user.id, routine.id).nextDue).toBe('2026-10-20');
		expect(getTask(user.id, other.id).nextDue).toBe('2026-10-19');
		expect(getTask(user.id, follower.id)).toMatchObject({ nextDue: '2026-10-20', triggerEntryId: dose.id });
		// one entry: the dose itself, with the completion pointing at it
		expect(dosesLogged(t.id)).toHaveLength(1);
		expect(db.$client.prepare('select event_id from task_completions where task_id = ?').get(routine.id)).toEqual({ event_id: dose.id });
	});

	it('change, start from their next time when moved, and go with a line in History', () => {
		const [row] = listDoses(doser.id);
		// moved to 09:00 at noon (a Monday in November, after the runs above): not logged for today, the doser may not have made it
		syncDoses(user, doser, [{ ...thrive, id: row.id, at: '09:00', seconds: null }, { ...thrive, product: 'Excel', amountMl: 2, at: '10:05', seconds: null }], new Date('2026-11-02T20:00:00Z'));
		const list = listDoses(doser.id);
		expect(list.map((x) => [x.product, x.at, x.position, x.lastLoggedOn])).toEqual([
			['Thrive+', '09:00', 0, '2026-11-02'],
			['Excel', '10:05', 1, '2026-11-02']
		]);
		expect(list[0].id).toBe(row.id);
		expect(eventTitle(dosesChanges(tank.id).at(-1)!, user)).toBe('Kamoer X1 doses Thrive+ 1 mL at 09:00 every day; Excel 2 mL at 10:05 every day');
		// the same again: no new line
		const n = dosesChanges(tank.id).length;
		syncDoses(user, doser, list.map((x) => ({ ...x })), new Date('2026-11-02T20:05:00Z'));
		expect(dosesChanges(tank.id)).toHaveLength(n);
		// all gone
		syncDoses(user, doser, [], new Date('2026-11-02T20:10:00Z'));
		expect(listDoses(doser.id)).toHaveLength(0);
		expect(db.select().from(autoDoses).where(eq(autoDoses.equipmentId, doser.id)).all()).toHaveLength(0);
		expect(eventTitle(dosesChanges(tank.id).at(-1)!, user)).toBe('Kamoer X1 doses nothing');
		expect(db.select().from(equipment).where(eq(equipment.id, doser.id)).get()?.removedAt).toBeNull();
	});
});
