import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Sensor charts are bucketed in SQLite (#103): a bounded number of points
// whatever the number of samples, each with its lowest and highest.
const dir = mkdtempSync(join(tmpdir(), 'wl-series-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { sensorReadings } = await import('./db/schema');
const { displaySamples, sampleCount, sampleSeries } = await import('./sensors');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'series@example.com', name: 'Series', googleSub: 'g-series' });
const MIN = 60_000;
const DAY = 86_400_000;

/** A tank with a probe sample every minute for `days`, ending at `end`. */
function probe(days: number, end: number, value: (i: number) => number) {
	const tank = createTank(user, { name: `Probe ${days}`, type: 'freshwater', nominalVolumeL: 100 });
	const temp = listParams(tank.id).find((p) => p.key === 'temp')!;
	const n = days * 1440;
	db.transaction((tx) => {
		for (let i = 0; i < n; i += 1000) {
			tx.insert(sensorReadings)
				.values(
					Array.from({ length: Math.min(1000, n - i) }, (_, j) => ({
						tankId: tank.id,
						parameterId: temp.id,
						value: value(i + j),
						at: new Date(end - (n - (i + j)) * MIN).toISOString(),
						source: 'probe'
					}))
				)
				.run();
		}
	});
	return { tank, temp, n, since: new Date(end - days * DAY - MIN).toISOString() };
}

/** What sampleSeries did before #103: every sample into Node, averaged there. */
function inNode(tankId: string, parameterId: string, since: string, buckets = 240, until = Date.now()) {
	const rows = db.$client
		.prepare('select value, at from sensor_readings where tank_id = ? and parameter_id = ? and at >= ? order by at')
		.all(tankId, parameterId, since) as { value: number; at: string }[];
	if (rows.length <= buckets) return rows.map((r) => ({ t: Date.parse(r.at), v: r.value }));
	const from = Date.parse(rows[0].at);
	const span = Math.max(1, (until - from) / buckets);
	const out: { t: number; v: number }[] = [];
	let i = 0;
	while (i < rows.length) {
		const end = Date.parse(rows[i].at) + span;
		let sum = 0;
		let n = 0;
		let tsum = 0;
		while (i < rows.length && Date.parse(rows[i].at) < end) {
			sum += rows[i].value;
			tsum += Date.parse(rows[i].at);
			n++;
			i++;
		}
		out.push({ t: Math.round(tsum / n), v: sum / n });
	}
	return out;
}

const time = <T>(f: () => T) => {
	const t0 = performance.now();
	const r = f();
	return { r, ms: performance.now() - t0 };
};

describe('sensor chart points (#103)', () => {
	it('averages known input into equal spans, with each span’s lowest and highest', () => {
		// 10 hours of minutes, 25.0 and 25.2 alternating, one spike to 31 at minute 300
		const end = Date.parse('2026-10-01T10:00:00Z');
		const { tank, temp, since } = probe(10 / 24, end, (i) => (i === 300 ? 31 : i % 2 ? 25.2 : 25));
		const pts = sampleSeries(tank.id, temp.id, since, 10, end);
		expect(pts).toHaveLength(10);
		for (const p of pts) expect(p.v).toBeGreaterThanOrEqual(25);
		// each hour: 60 samples, half 25 and half 25.2
		const quiet = pts.filter((p) => p.hi === 25.2);
		expect(quiet).toHaveLength(9);
		for (const p of quiet) {
			expect(p.v).toBeCloseTo(25.1, 6);
			expect(p.lo).toBe(25);
		}
		// the spike: averaged into its hour, but its highest is kept
		const spiked = pts.find((p) => p.hi === 31)!;
		expect(spiked.v).toBeCloseTo((29 * 25 + 30 * 25.2 + 31) / 60, 6);
		// points are in order, inside the range
		for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
		expect(pts[0].t).toBeGreaterThanOrEqual(Date.parse(since));
		// in °F, the band converts with the line
		const f = displaySamples(pts, temp, { unitSystem: 'imperial', hardnessUnit: 'dgh' })[0];
		expect(f.v).toBeCloseTo(pts[0].v * 1.8 + 32, 6);
		expect(f.hi).toBeCloseTo(pts[0].hi! * 1.8 + 32, 6);
	});

	it('gives the samples themselves when there are fewer than the points asked for', () => {
		const end = Date.parse('2026-10-02T00:00:00Z');
		const { tank, temp, since } = probe(1 / 24, end, (i) => 24 + i / 100);
		const pts = sampleSeries(tank.id, temp.id, since, 240, end);
		expect(pts).toHaveLength(60);
		expect(pts[0]).toEqual({ t: end - 60 * MIN, v: 24 });
		expect(sampleSeries(tank.id, temp.id, new Date(end + DAY).toISOString(), 240, end)).toEqual([]);
	});

	it('counts a parameter\'s samples up to a limit, for an empty chart\'s wording (#130)', () => {
		const end = Date.parse('2026-10-02T00:00:00Z');
		const { tank, temp } = probe(1 / 24, end, () => 24);
		expect(sampleCount(tank.id, temp.id)).toBe(2);
		expect(sampleCount(tank.id, temp.id, 100)).toBe(60);
		const other = listParams(tank.id).find((p) => p.key !== 'temp')!;
		expect(sampleCount(tank.id, other.id)).toBe(0);
	});

	it('reads hours or samples through their indexes, never a whole table', () => {
		const plan = (q: string) => (db.$client.prepare(`explain query plan ${q}`).all() as { detail: string }[]).map((r) => r.detail).join('\n');
		const hours = plan("select sum(n) from sensor_hours where tank_id = 'x' and parameter_id = 'y' and hour >= 'a' and hour < 'b'");
		expect(hours).toMatch(/SEARCH sensor_hours USING (INDEX|PRIMARY KEY|COVERING INDEX) sqlite_autoindex_sensor_hours_1/);
		const samples = plan("select avg(value) from sensor_readings where tank_id = 'x' and parameter_id = 'y' and at >= 'a' and at < 'b'");
		expect(samples).toMatch(/SEARCH sensor_readings USING INDEX sensor_readings_tank_param_at/);
	});

	it('keeps each hour in sum as samples come and go, and the migration counts them the same', async () => {
		const { pruneSamples } = await import('./sensors');
		const { sensorHours } = await import('./db/schema');
		const { and, eq } = await import('drizzle-orm');
		const end = Date.parse('2026-01-01T03:00:00Z');
		const { tank, temp } = probe(3 / 24, end, (i) => 20 + (i % 60) / 10);
		const hours = () =>
			db
				.select()
				.from(sensorHours)
				.where(and(eq(sensorHours.tankId, tank.id), eq(sensorHours.parameterId, temp.id)))
				.orderBy(sensorHours.hour)
				.all()
				.map((h) => ({ hour: h.hour, n: h.n, avg: +(h.total / h.n).toFixed(6), lo: h.lo, hi: h.hi }));
		expect(hours()).toEqual(
			['2026-01-01T00', '2026-01-01T01', '2026-01-01T02'].map((hour) => ({ hour, n: 60, avg: 22.95, lo: 20, hi: 25.9 }))
		);
		// what the migration does for samples already there: the same sums
		const made = hours();
		db.delete(sensorHours).where(eq(sensorHours.tankId, tank.id)).run();
		const fill = (await import('node:fs')).readFileSync(new URL('../../../drizzle/0044_sensor_hours.sql', import.meta.url), 'utf8').split('--> statement-breakpoint')[1];
		db.$client.exec(fill.replace('GROUP BY', `WHERE tank_id = '${tank.id}' GROUP BY`));
		expect(hours()).toEqual(made);
		// pruned up to 01:30: the first hour goes, the second keeps its last half
		pruneSamples(Date.parse('2026-01-01T01:30:00Z') + 365 * DAY);
		const after = hours();
		expect(after.map((h) => [h.hour, h.n])).toEqual([
			['2026-01-01T01', 30],
			['2026-01-01T02', 60]
		]);
		expect(after[0].avg).toBeCloseTo(20 + 4.45, 6);
	});

	// a year of minutes takes a while to write: BENCH=1 npx vitest run src/lib/server/sensor-series.test.ts
	for (const days of process.env.BENCH ? [7, 30, 90, 365] : [7, 30, 90]) {
		it(`${days} days of one-minute samples come out as at most 241 points, the same line as before`, () => {
			const end = Date.parse('2026-09-30T00:00:00Z');
			// a daily swing, and a one-minute spike on day 3 that a plain average would hide
			const spikeAt = 3 * 1440 + 600;
			const { tank, temp, n, since } = probe(days, end, (i) => (i === spikeAt ? 32 : 25 + Math.sin((i / 1440) * 2 * Math.PI)));
			const sql = time(() => sampleSeries(tank.id, temp.id, since, 240, end));
			const node = time(() => inNode(tank.id, temp.id, since, 240, end));
			console.log(`${days} days, ${n} samples: SQL ${sql.ms.toFixed(0)} ms → ${sql.r.length} points; in Node before ${node.ms.toFixed(0)} ms → ${node.r.length} points`);
			// a week is spans of minutes, from the samples; longer, from hours
			expect(sql.r.length).toBeLessThanOrEqual(241);
			expect(sql.r.length).toBeGreaterThan(200);
			// the spike is in the band, though the averages never reach it
			expect(Math.max(...sql.r.map((p) => p.hi!))).toBe(32);
			expect(Math.max(...sql.r.map((p) => p.v))).toBeLessThan(27);
			// materially the same line: at each point, the old line nearby is within a few tenths
			for (const p of sql.r) {
				const near = node.r.reduce((a, b) => (Math.abs(b.t - p.t) < Math.abs(a.t - p.t) ? b : a));
				expect(Math.abs(near.v - p.v)).toBeLessThan(0.35);
			}
		}, 120_000);
	}
});
