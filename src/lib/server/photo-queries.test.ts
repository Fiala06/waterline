import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Photos are found through indexes (#119): a tank's by date, an entry's by
// its id. The functions' own queries are recorded and their plans read, over
// a few thousand photos in several tanks.
const dir = mkdtempSync(join(tmpdir(), 'wl-photo-queries-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, photos, tests } = await import('./db/schema');
const { entryPhotos, removeEntryPhotoFiles, tankPhotos, thumbsFor } = await import('./photos');
const { timelineEntries } = await import('./timeline');
const { createTank } = await import('./tanks');
const { upsertUser } = await import('./users');
const { authenticateAssistant, createAssistantToken } = await import('./assistant/tokens');
const { runTool } = await import('./assistant/tools');

const user = upsertUser({ email: 'photo-queries@example.com', name: 'Photos', googleSub: 'g-photo-queries' });
const tanks = Array.from({ length: 4 }, (_, i) => createTank(user, { name: `Tank ${i}`, type: 'planted', nominalVolumeL: 100 }));
const [tank] = tanks;
const t0 = Date.parse('2024-01-01T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// 4 tanks × 1,000 photos, a third on events and a third on tests
const eventIds: string[] = [];
const testIds: string[] = [];
db.transaction((tx) => {
	for (const t of tanks) {
		for (let i = 0; i < 1000; i++) {
			const at = iso(t0 + i * 86_400_000);
			let eventId: string | null = null;
			let testId: string | null = null;
			if (i % 3 === 1) eventId = tx.insert(events).values({ tankId: t.id, category: 'note', occurredAt: at, loggedBy: user.id }).returning().get().id;
			if (i % 3 === 2) testId = tx.insert(tests).values({ tankId: t.id, takenAt: at, loggedBy: user.id }).returning().get().id;
			if (t.id === tank.id && eventId) eventIds.push(eventId);
			if (t.id === tank.id && testId) testIds.push(testId);
			tx.insert(photos).values({ tankId: t.id, eventId, testId, path: `p${i}.jpg`, thumbPath: `t${i}.jpg`, width: 1, height: 1, takenAt: at, inTimeline: i % 5 !== 0 }).run();
		}
	}
});

/** The statements `fn` runs that read photos, with their parameters. */
function photoQueries(fn: () => unknown) {
	const client = db.$client;
	const seen: { sql: string; params: unknown[] }[] = [];
	const prepare = client.prepare.bind(client);
	const spy = vi.spyOn(client, 'prepare').mockImplementation(((src: string) => {
		const st = prepare(src);
		if (/from "photos"|join "photos"/.test(src)) {
			for (const m of ['all', 'get', 'run'] as const) {
				const f = (st[m] as (...a: unknown[]) => unknown).bind(st);
				(st as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => (seen.push({ sql: src, params: a }), f(...a));
			}
		}
		return st;
	}) as typeof client.prepare);
	try {
		fn();
	} finally {
		spy.mockRestore();
	}
	return seen;
}

/** Each statement's plan, as one string per statement. */
const plans = (qs: { sql: string; params: unknown[] }[]) =>
	qs.map((q) => (db.$client.prepare(`explain query plan ${q.sql}`).all(...(q.params as [])) as { detail: string }[]).map((r) => r.detail).join(' | '));

describe('photo queries (#119)', () => {
	it('a tank’s photos, newest first, come from the tank-and-date index without sorting', () => {
		const q = photoQueries(() => expect(tankPhotos(user.id, tank.id)).toHaveLength(1000));
		const [p] = plans(q);
		expect(p).toMatch(/photos USING INDEX photos_tank_taken/);
		expect(p).not.toMatch(/SCAN photos(?! USING)|TEMP B-TREE/);
	});

	it('the timeline’s newest photos, and the public page’s, the same way', () => {
		const q = photoQueries(() => expect(timelineEntries(tank, { ...user, timeZone: 'UTC' }, { limit: 12, names: false })).toHaveLength(12));
		const all = plans(q);
		expect(all.length).toBeGreaterThan(0);
		for (const p of all) {
			expect(p).toMatch(/photos USING (COVERING )?INDEX photos_tank_taken/);
			expect(p).not.toMatch(/SCAN photos(?! USING)/);
		}
	});

	it('an entry’s photos, thumbnails for a list of entries, and removing an entry’s, by the entry’s index', () => {
		const q = photoQueries(() => {
			expect(entryPhotos({ eventId: eventIds[0] })).toHaveLength(1);
			expect(entryPhotos({ testId: testIds[0] })).toHaveLength(1);
			expect(thumbsFor(eventIds.slice(0, 20), testIds.slice(0, 20)).size).toBe(40);
			removeEntryPhotoFiles({ testId: testIds[1] });
		});
		const all = plans(q);
		expect(all.length).toBeGreaterThanOrEqual(5);
		for (const p of all) {
			expect(p).toMatch(/photos USING (COVERING )?INDEX (photos_event|photos_test)|photos USING INDEX sqlite_autoindex_photos_1/);
			expect(p).not.toMatch(/SCAN photos(?! USING)/);
		}
	});

	it('an assistant’s photo list, too', async () => {
		const { token } = createAssistantToken(user.id, 'Claude', [tank.id]);
		const access = authenticateAssistant(`Bearer ${token}`)!;
		let run: Promise<unknown> = Promise.resolve();
		const q = photoQueries(() => (run = runTool(access, 'list_photos', { tank_id: tank.id, limit: 20 })));
		await run;
		const [p] = plans(q);
		expect(p).toMatch(/photos USING INDEX photos_tank_taken/);
		expect(p).not.toMatch(/SCAN photos(?! USING)/);
	});
});
