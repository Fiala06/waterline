import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Tasks and Charts read what they need for the whole list at once (#358),
// giving what the one-at-a-time helpers give.
const dir = mkdtempSync(join(tmpdir(), 'wl-list-queries-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, taskCompletions, testReadings, tests } = await import('./db/schema');
const { readingCount, series, seriesFor } = await import('./logs');
const { countableEntry, createTask, lastDoneOn, lastDoneOnFor, latestEntriesFor } = await import('./tasks');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const tz = 'America/Los_Angeles';
const user = upsertUser({ email: 'lists@example.com', name: 'Lists', googleSub: 'g-lists' });
const a = createTank(user, { name: 'A', type: 'freshwater', nominalVolumeL: 100 });
const b = createTank(user, { name: 'B', type: 'freshwater', nominalVolumeL: 60 });
const task = (tankId: string, kind: 'water_change' | 'test' | 'other', nextDue: string) =>
	createTask(user.id, tankId, { name: kind, kind, recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue, openFormOnDone: false });
const wcA = task(a.id, 'water_change', '2026-03-05');
const testA = task(a.id, 'test', '2026-03-05');
const wcB = task(b.id, 'water_change', '2026-03-05');
const never = task(b.id, 'other', '2026-03-05');

const done = (taskId: string, completedAt: string, skipped = false) => db.insert(taskCompletions).values({ taskId, completedAt, skipped }).run();
done(wcA.id, '2026-02-20T18:00:00.000Z');
done(wcA.id, '2026-02-27T06:30:00.000Z'); // the 26th in Los Angeles
done(wcA.id, '2026-03-01T18:00:00.000Z', true); // skipped: not done
done(testA.id, '2026-02-01T18:00:00.000Z');

const [ph, no3] = ['ph', 'no3'].map((k) => listParams(a.id).find((p) => p.key === k)!);
for (const [at, v] of [
	['2026-02-02T18:00:00.000Z', 7],
	['2026-03-04T18:00:00.000Z', 7.2],
	['2026-01-10T18:00:00.000Z', 6.8]
] as const) {
	const t = db.insert(tests).values({ tankId: a.id, takenAt: at, loggedBy: user.id }).returning().get();
	db.insert(testReadings).values({ testId: t.id, parameterId: ph.id, value: v }).run();
	if (v === 7.2) db.insert(testReadings).values({ testId: t.id, parameterId: no3.id, value: 20 }).run();
}
db.insert(events).values({ tankId: a.id, category: 'water_change', occurredAt: '2026-03-04T19:00:00.000Z', loggedBy: user.id, data: {} }).run();
db.insert(events).values({ tankId: a.id, category: 'water_change', occurredAt: '2026-02-10T19:00:00.000Z', loggedBy: user.id, data: {} }).run();

describe('Tasks, for the whole list', () => {
	const all = [wcA, testA, wcB, never];

	it('gives each task its last done day, as lastDoneOn does', () => {
		const last = lastDoneOnFor(all.map((t) => t.id), tz);
		for (const t of all) expect(last.get(t.id) ?? null).toBe(lastDoneOn(t.id, tz));
		expect(last.get(wcA.id)).toBe('2026-02-26');
		expect(last.has(never.id)).toBe(false);
		expect(lastDoneOnFor([], tz).size).toBe(0);
	});

	it('finds the same countable entry with what was read for the list', () => {
		const lastDone = lastDoneOnFor(all.map((t) => t.id), tz);
		const latest = latestEntriesFor([a.id, b.id]);
		expect(latest.test.get(a.id)?.at).toBe('2026-03-04T18:00:00.000Z');
		expect(latest.waterChange.get(a.id)?.at).toBe('2026-03-04T19:00:00.000Z');
		expect(latest.waterChange.has(b.id)).toBe(false);
		for (const t of all) {
			expect(countableEntry(t, tz, { lastDone: lastDone.get(t.id) ?? null, latest })).toEqual(countableEntry(t, tz));
		}
		expect(countableEntry(wcA, tz)).not.toBeNull();
	});
});

describe('Charts, for every parameter', () => {
	it('reads each series as series() does, in one query', () => {
		const ids = listParams(a.id).map((p) => p.id);
		for (const since of ['0000', '2026-02-01']) {
			const all = seriesFor(a.id, ids, since);
			for (const id of ids) expect(all.get(id)).toEqual(series(a.id, id, since));
		}
		expect(seriesFor(a.id, [ph.id], '0000').get(ph.id)!.map((r) => r.value)).toEqual([6.8, 7, 7.2]);
	});

	it('counts readings without reading them', () => {
		expect(readingCount(a.id, ph.id)).toBe(3);
		expect(readingCount(a.id, no3.id)).toBe(1);
		expect(readingCount(b.id, ph.id)).toBe(0);
	});
});
