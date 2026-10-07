import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The latest reading per parameter, read without loading a tank's whole history (#99, #116).
const dir = mkdtempSync(join(tmpdir(), 'wl-history-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { sensorReadings, testReadings, tests } = await import('./db/schema');
const { latestReadings, latestReadingsQuery, testsSince } = await import('./logs');
const { latestSamples, latestSamplesQuery } = await import('./sensors');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'history@example.com', name: 'History', googleSub: 'g-history' });
const tank = createTank(user, { name: 'Old tank', type: 'freshwater', nominalVolumeL: 100 });
const other = createTank(user, { name: 'Other tank', type: 'freshwater', nominalVolumeL: 60 });
const params = listParams(tank.id);
const [temp, ph, no3, gh] = ['temp', 'ph', 'no3', 'gh'].map((k) => params.find((p) => p.key === k)!);
const t0 = Date.parse('2024-01-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

type Q = { toSQL(): { sql: string; params: unknown[] } };
function plan(q: Q): string {
	const { sql, params } = q.toSQL();
	return (db.$client.prepare(`explain query plan ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail).join('\n');
}

describe('latest readings over a long history', () => {
	// two years of tests every 3 days: pH in every one, nitrate in every other, GH once at the start
	const N = 250;
	db.transaction((tx) => {
		for (let i = 0; i < N; i++) {
			const t = tx.insert(tests).values({ tankId: tank.id, takenAt: iso(t0 + i * 3 * 86_400_000), loggedBy: user.id }).returning().get();
			const rows = [{ testId: t.id, parameterId: ph.id, value: 6 + i / 1000 }];
			if (i % 2 === 0) rows.push({ testId: t.id, parameterId: no3.id, value: i });
			if (i === 0) rows.push({ testId: t.id, parameterId: gh.id, value: 7 });
			tx.insert(testReadings).values(rows).run();
		}
		// another tank's newer test doesn't count
		const o = tx.insert(tests).values({ tankId: other.id, takenAt: iso(t0 + N * 4 * 86_400_000), loggedBy: user.id }).returning().get();
		tx.insert(testReadings).values({ testId: o.id, parameterId: listParams(other.id).find((p) => p.key === 'ph')!.id, value: 9 }).run();
	});

	it('returns the newest reading of each parameter, as reading every test would', () => {
		const naive = new Map<string, { value: number; takenAt: string }>();
		const rows = db.$client
			.prepare('select r.parameter_id as p, r.value as v, t.taken_at as at from test_readings r join tests t on t.id = r.test_id where t.tank_id = ? order by t.taken_at desc')
			.all(tank.id) as { p: string; v: number; at: string }[];
		for (const r of rows) if (!naive.has(r.p)) naive.set(r.p, { value: r.v, takenAt: r.at });

		const latest = latestReadings(tank.id);
		expect(latest).toEqual(naive);
		expect(latest.size).toBe(3);
		expect(latest.get(ph.id)).toEqual({ value: 6 + (N - 1) / 1000, takenAt: iso(t0 + (N - 1) * 3 * 86_400_000) });
		expect(latest.get(no3.id)?.value).toBe(N - 2);
		expect(latest.get(gh.id)).toEqual({ value: 7, takenAt: iso(t0) });
		expect(latest.has(temp.id)).toBe(false);
	});

	it('looks each parameter up by index, never reading the whole history', () => {
		const p = plan(latestReadingsQuery(tank.id));
		expect(p).toMatch(/tests_tank_taken/);
		expect(p).toMatch(/test_readings_param/);
		expect(p).not.toMatch(/SCAN (tests|test_readings)\b(?! USING)/);
		expect(p).not.toMatch(/TEMP B-TREE/);
	});

	it('pairs tests with their readings', () => {
		const since = testsSince(tank.id, iso(t0 + (N - 4) * 3 * 86_400_000));
		expect(since.map((s) => [...s.readings.keys()].sort())).toEqual([[no3.id, ph.id].sort(), [ph.id], [no3.id, ph.id].sort(), [ph.id]]);
		expect(since[0].readings.get(no3.id)).toBe(N - 4);
	});
});

describe('latest sensor samples over a year of minutes', () => {
	it('returns the newest sample of each parameter, by index', () => {
		const N = 20_000;
		db.transaction((tx) => {
			for (let i = 0; i < N; i += 500) {
				tx.insert(sensorReadings)
					.values(
						Array.from({ length: 500 }, (_, j) => ({
							tankId: tank.id,
							parameterId: (i + j) % 2 ? temp.id : ph.id,
							value: i + j,
							at: iso(t0 + (i + j) * 60_000),
							source: (i + j) % 2 ? 'probe' : 'controller'
						}))
					)
					.run();
			}
		});
		const latest = latestSamples(tank.id);
		expect(latest.size).toBe(2);
		expect(latest.get(temp.id)).toEqual({ parameterId: temp.id, value: N - 1, at: iso(t0 + (N - 1) * 60_000), source: 'probe' });
		expect(latest.get(ph.id)).toMatchObject({ value: N - 2, source: 'controller' });
		expect(latestSamples(other.id).size).toBe(0);

		const p = plan(latestSamplesQuery(tank.id));
		expect(p).toMatch(/sensor_readings_tank_param_at/);
		expect(p).not.toMatch(/SCAN sensor_readings\b(?! USING)/);
		expect(p).not.toMatch(/TEMP B-TREE/);
	});
});
