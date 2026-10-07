import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The timeline reads only what it shows (#115): a few photos from years of history.
const dir = mkdtempSync(join(tmpdir(), 'wl-timeline-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, livestock, photoLivestock, photos, plants, testReadings, tests } = await import('./db/schema');
const { timelineEntries } = await import('./timeline');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'timeline@example.com', name: 'Timeline', googleSub: 'g-timeline' });
const tank = createTank(user, { name: 'Long tank', type: 'freshwater', nominalVolumeL: 120, startDate: '2023-01-01' });
const params = listParams(tank.id);
const [ph, no3] = ['ph', 'no3'].map((k) => params.find((p) => p.key === k)!);
const prefs = { ...user, timeZone: 'America/Los_Angeles' };
const DAY = 86_400_000;
const t0 = Date.parse('2023-01-01T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const PUBLIC = ['water_change', 'dosing', 'maintenance', 'livestock', 'equipment'] as const;

// three years: a test most days with gaps, an event most days, a photo a week, livestock and plants coming and going
const N_DAYS = 3 * 365;
db.transaction((tx) => {
	const fish: string[] = [];
	for (let d = 0; d < N_DAYS; d++) {
		const at = t0 + d * DAY;
		// tests skip whole weeks now and then, so some photos have none near and some take one after
		if (d % 80 < 45 && d % 3 === 0) {
			const t = tx.insert(tests).values({ tankId: tank.id, takenAt: iso(at + 3_600_000), loggedBy: user.id }).returning().get();
			const rows = [{ testId: t.id, parameterId: ph.id, value: 6.5 + (d % 7) / 10 }];
			if (d % 2 === 0) rows.push({ testId: t.id, parameterId: no3.id, value: (d * 7) % 60 });
			tx.insert(testReadings).values(rows).run();
		}
		const category = (['water_change', 'dosing', 'maintenance', 'note', 'livestock'] as const)[d % 5];
		tx.insert(events)
			.values({ tankId: tank.id, category, occurredAt: iso(at + 7_200_000), data: category === 'livestock' ? { action: d % 10 === 4 ? 'named' : 'added', nickname: 'Bubbles', name: 'Neon tetra', count: 2 } : {} })
			.run();
		if (d % 30 === 5) {
			const l = tx
				.insert(livestock)
				.values({ tankId: tank.id, kind: 'fish', commonName: `Fish ${d}`, count: 1 + (d % 4), addedAt: dateOf(at), removedAt: d % 60 === 5 ? iso(at + 90 * DAY) : null })
				.returning()
				.get();
			fish.push(l.id);
		}
		if (d % 45 === 0) tx.insert(plants).values({ tankId: tank.id, name: `Plant ${d}`, createdAt: iso(at), removedAt: d % 90 === 0 ? iso(at + 100 * DAY) : null }).run();
		if (d % 7 === 2) {
			const p = tx
				.insert(photos)
				.values({ tankId: tank.id, path: `p${d}.jpg`, thumbPath: `t${d}.jpg`, width: 10, height: 10, takenAt: iso(at + 5 * 3_600_000), inTimeline: d % 49 !== 2 })
				.returning()
				.get();
			if (d % 21 === 2 && fish.length) tx.insert(photoLivestock).values({ photoId: p.id, livestockId: fish.at(-1)! }).run();
		}
	}
});
function dateOf(ms: number) {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Every row the database hands back while `fn` runs. */
function rowsRead<T>(fn: () => T): { result: T; rows: number } {
	const client = db.$client;
	const prepare = client.prepare.bind(client);
	let rows = 0;
	const spy = vi.spyOn(client, 'prepare').mockImplementation(((source: string) => {
		const st = prepare(source);
		const all = st.all.bind(st);
		const get = st.get.bind(st);
		st.all = ((...a: unknown[]) => {
			const r = all(...(a as []));
			rows += r.length;
			return r;
		}) as typeof st.all;
		st.get = ((...a: unknown[]) => {
			const r = get(...(a as []));
			if (r) rows++;
			return r;
		}) as typeof st.get;
		return st;
	}) as typeof client.prepare);
	try {
		return { result: fn(), rows };
	} finally {
		spy.mockRestore();
	}
}

/** Without the ids, which are new each run. */
const shape = (es: { id: string; testId: string | null }[]) =>
	createHash('sha256')
		.update(JSON.stringify(es.map((e) => ({ ...e, id: null, testId: !!e.testId }))))
		.digest('hex');
const strip = <E extends { gap: unknown }>(e: E) => ({ ...e, gap: null });

describe('the timeline over a long history (#115)', () => {
	const full = timelineEntries(tank, prefs);
	const publicFull = timelineEntries(tank, prefs, { names: false, readings: true, activity: true, categories: PUBLIC });

	it('shows the same as before, for the keeper and on the public page', () => {
		expect(full.length).toBeGreaterThan(100);
		expect(full.some((e) => e.readings && e.tested?.includes('later'))).toBe(true);
		expect(full.some((e) => !e.readings)).toBe(true);
		// what the timeline showed before #115, for this history
		expect(shape(full)).toBe('7f8570a351a8d25fcdb78a6530215b12ac132a10ac588ae5764b4f966043c946');
		expect(shape(publicFull)).toBe('79a88fffef7fb65bf6c7c3d4e64a13ad65c1b2d8dd5e07eeb9caaa5950881667');
		// tagged photos and pets' names stay off the public one
		expect(publicFull.length).toBeLessThan(full.length);
		expect(JSON.stringify(publicFull)).not.toMatch(/Bubbles|named/);
	});

	it('the last few are the last few of the whole, from their nearest tests to what they counted', () => {
		for (const limit of [1, 5, 12, 40]) {
			const some = timelineEntries(tank, prefs, { limit });
			expect(some.length).toBe(limit);
			expect(some.map(strip)).toEqual(full.slice(-limit).map(strip));
			expect(some.slice(1)).toEqual(full.slice(full.length - limit + 1));
			expect(some[0].gap).toBeNull();
			const pub = timelineEntries(tank, prefs, { names: false, readings: true, activity: true, categories: PUBLIC, limit });
			expect(pub.slice(1)).toEqual(publicFull.slice(publicFull.length - limit + 1));
		}
		const off = timelineEntries(tank, prefs, { names: false, readings: false, activity: false, categories: PUBLIC, limit: 12 });
		expect(off.every((e) => e.readings == null && e.testId == null)).toBe(true);
	});

	it('reads rows in proportion to the photos shown, not the tank’s age', () => {
		const { result, rows } = rowsRead(() => timelineEntries(tank, prefs, { names: false, categories: PUBLIC, limit: 12 }));
		expect(result).toHaveLength(12);
		// 12 photos span about 12 weeks: their tests, readings and events, plus the tank's livestock, plants and parameters
		expect(rows).toBeLessThan(400);
		const all = rowsRead(() => timelineEntries(tank, prefs));
		expect(all.rows).toBeGreaterThan(rows * 5);
	});
});
