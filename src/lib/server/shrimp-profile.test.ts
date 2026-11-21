import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// A shrimp tank (#319): its readings tracked and kept in view, pH, GH, KH and
// TDS without a one-size target, and turning it on or off never drops custom
// parameters, targets the keeper set, or readings.
const dir = mkdtempSync(join(tmpdir(), 'wl-shrimp-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const s = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser, getUser } = await import('./users');
const { createTank, getTank, listParams, setShrimpProfile } = await import('./tanks');
const { createTest } = await import('./logs');
const { defaultParameters, foldsInTestForm, SHRIMP_KEYS } = await import('$lib/params');

const me = getUser(upsertUser({ email: 'shrimp@example.com', name: 'Shrimp', googleSub: 'g-shrimp' }).id)!;
const byKey = (tankId: string) => Object.fromEntries(listParams(tankId, { all: true }).map((p) => [p.key, p]));

describe('a shrimp tank (#319)', () => {
	it('starts with its readings tracked, pH, GH, KH and TDS without targets', () => {
		const t = createTank(me, { name: 'Shrimp cube', type: 'planted', growingStyle: 'low_tech', shrimp: true, nominalVolumeL: 20 });
		expect(getTank(me.id, t.id).shrimp).toBe(true);
		const p = byKey(t.id);
		for (const k of SHRIMP_KEYS) expect(p[k].tracked, k).toBe(true); // TDS too, which low-tech leaves off
		for (const k of ['ph', 'gh', 'kh', 'tds']) expect([p[k].min, p[k].max], k).toEqual([null, null]);
		expect(p.temp.min).not.toBeNull();
		expect(p.co2.tracked).toBe(false); // the rest of low-tech as it was
		expect(foldsInTestForm({ key: 'tds' }, 'planted', false, 'low_tech', true)).toBe(false);
		expect(foldsInTestForm({ key: 'tds' }, 'planted', false, 'low_tech', false)).toBe(true);
	});

	it('is skipped unless asked for, and is only for freshwater and planted tanks', () => {
		const plain = createTank(me, { name: 'Community', type: 'freshwater', nominalVolumeL: 100 });
		expect(byKey(plain.id).ph.min).toBe(6);
		expect(getTank(me.id, plain.id).shrimp).toBe(false);
		expect(defaultParameters(me, 'reef', null, true).find((p) => p.key === 'ph')!.min).not.toBeNull();
		const reef = createTank(me, { name: 'Reef', type: 'reef', nominalVolumeL: 200 });
		expect(() => setShrimpProfile(me, reef.id, true)).toThrow();
	});

	it('turned on later keeps the targets, custom parameters and readings there, and adds what is missing', () => {
		const t = createTank(me, { name: 'Converted', type: 'planted', growingStyle: 'simple', nominalVolumeL: 60 });
		const p = byKey(t.id);
		db.update(s.tankParameters).set({ min: 6.5, max: 7.5 }).where(eq(s.tankParameters.id, p.ph.id)).run();
		db.delete(s.tankParameters).where(eq(s.tankParameters.id, p.kh.id)).run();
		db.insert(s.tankParameters).values({ tankId: t.id, key: 'custom', name: 'Copper', unit: 'ppm', decimals: 2, isCustom: true, sort: 99 }).run();
		createTest(me.id, t.id, { takenAt: new Date().toISOString(), note: null, readings: new Map([[p.ph.id, 7]]) }, { timeZone: 'UTC' });

		setShrimpProfile(me, t.id, true);
		const after = byKey(t.id);
		expect([after.ph.min, after.ph.max]).toEqual([6.5, 7.5]);
		expect(after.tds.tracked).toBe(true);
		expect(after.kh).toMatchObject({ tracked: true, min: null, max: null });
		expect(listParams(t.id, { all: true }).some((x) => x.isCustom && x.name === 'Copper')).toBe(true);
		expect(db.select().from(s.testReadings).where(eq(s.testReadings.parameterId, p.ph.id)).all()).toHaveLength(1);

		// on again changes nothing; off leaves every parameter as it is
		const before = listParams(t.id, { all: true });
		setShrimpProfile(me, t.id, true);
		setShrimpProfile(me, t.id, false);
		expect(getTank(me.id, t.id).shrimp).toBe(false);
		expect(listParams(t.id, { all: true })).toEqual(before);
		const notes = db.select().from(s.events).where(eq(s.events.tankId, t.id)).all().map((e) => e.data.system);
		expect(notes.filter((n) => n === 'shrimp_on')).toHaveLength(1);
		expect(notes.filter((n) => n === 'shrimp_off')).toHaveLength(1);
	});
});
