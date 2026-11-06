import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { eventTitle } from '$lib/events';
import { pausedSince, pausedText } from '$lib/equipment';

const dir = mkdtempSync(join(tmpdir(), 'wl-eq-paused-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, users } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, getEquipment, removeEquipment, setEquipmentPaused } = await import('./specs');
const { listDoses, logDueDoses, resumeDose, syncDoses } = await import('./dosers');

const user = upsertUser({ email: 'paused@example.com', name: 'Keeper' });

describe('paused equipment', () => {
	it('says how long it has been off', () => {
		expect(pausedSince('2026-11-05', '2026-11-05')).toBe('today');
		expect(pausedSince('2026-11-04', '2026-11-05')).toBe('since Nov 4 · 1 day');
		expect(pausedText('2026-11-02', '2026-11-05')).toBe('‖ Paused since Nov 2 · 3 days');
	});

	it('pauses and resumes once each way, noting both in History', () => {
		const tank = createTank(user, { name: 'Doser tank', type: 'planted', nominalVolumeL: 60 });
		const e = addEquipment(user.id, tank.id, { type: 'other', brand: 'Jebao', model: 'Doser', specs: {}, installedAt: null, notes: null }, user.timeZone);
		setEquipmentPaused(user.id, e.id, true, user.timeZone);
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		// pausing again changes nothing
		setEquipmentPaused(user.id, e.id, true, user.timeZone);
		setEquipmentPaused(user.id, e.id, false, user.timeZone);
		expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
		const titles = db
			.select()
			.from(events)
			.where(eq(events.tankId, tank.id))
			.all()
			.filter((x) => x.data.action === 'paused' || x.data.action === 'resumed')
			.map((x) => eventTitle(x, user));
		expect(titles.sort()).toEqual(['Paused Jebao Doser', 'Resumed Jebao Doser']);
	});

	it("can't pause what was removed", () => {
		const tank = createTank(user, { name: 'Gone tank', type: 'planted', nominalVolumeL: 60 });
		const e = addEquipment(user.id, tank.id, { type: 'pump', brand: 'Old', model: 'Pump', specs: {}, installedAt: null, notes: null }, user.timeZone);
		removeEquipment(user.id, e.id);
		expect(() => setEquipmentPaused(user.id, e.id, true, user.timeZone)).toThrow();
	});

	describe('a doser (#196)', () => {
		// a keeper in Los Angeles: 10:00 there is 17:00Z in October
		const la = db.update(users).set({ timeZone: 'America/Los_Angeles' }).where(eq(users.id, upsertUser({ email: 'paused-la@example.com', name: 'LA' }).id)).returning().get();
		const tank = createTank(la, { name: 'Dosed tank', type: 'planted', nominalVolumeL: 100 });
		const doser = addEquipment(la.id, tank.id, { type: 'doser', brand: 'Kamoer', model: 'X1', specs: {}, installedAt: null, notes: null }, la.timeZone);
		const thrive = { id: null, product: 'Thrive+', amountMl: 1, at: '10:00', seconds: null, weekdays: null, paused: false };
		const doses = () => db.select().from(events).where(eq(events.tankId, tank.id)).all().filter((x) => x.category === 'dosing');

		it("paused, logs no doses; resumed after a dose's time, picks up from the next one", async () => {
			syncDoses(la, doser, [thrive], new Date('2026-10-19T16:00:00Z'));
			setEquipmentPaused(la.id, doser.id, true, la.timeZone, '2026-10-19T16:30:00Z');
			expect(await logDueDoses(new Date('2026-10-19T17:05:00Z'))).toBe(0);
			// back on at 10:30, after today's 10:00: today's isn't logged, tomorrow's is
			setEquipmentPaused(la.id, doser.id, false, la.timeZone, '2026-10-19T17:30:00Z');
			expect(await logDueDoses(new Date('2026-10-19T17:35:00Z'))).toBe(0);
			expect(await logDueDoses(new Date('2026-10-20T17:05:00Z'))).toBe(1);
			expect(doses()).toHaveLength(1);
		});

		it('resumes one paused dose', () => {
			const [d] = listDoses(doser.id);
			syncDoses(la, doser, [{ ...thrive, id: d.id, paused: true }]);
			expect(listDoses(doser.id)[0].paused).toBe(true);
			expect(resumeDose(la, doser, d.id)?.product).toBe('Thrive+');
			expect(listDoses(doser.id)[0].paused).toBe(false);
			// not paused: nothing to do
			expect(resumeDose(la, doser, d.id)).toBeNull();
		});
	});
});
