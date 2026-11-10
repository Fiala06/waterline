import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// History a page at a time (#240): every entry on exactly one page, in order,
// whatever shares a timestamp, with the counts and the filter done in SQL.
const dir = mkdtempSync(join(tmpdir(), 'wl-history-page-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, tests } = await import('./db/schema');
const { cursorText, historyCounts, historyPage, parseCursor } = await import('./history-page');
const { createTank } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'pages@example.com', name: 'Pages', googleSub: 'g-pages' });
const tank = createTank(user, { name: 'Long history', type: 'freshwater', nominalVolumeL: 100 });
const other = createTank(user, { name: 'Another', type: 'freshwater', nominalVolumeL: 60 });
// a new tank starts with an entry of its own; these tests count only what they put in
const { eq } = await import('drizzle-orm');
for (const t of [tank, other]) db.delete(events).where(eq(events.tankId, t.id)).run();
const t0 = Date.parse('2026-01-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;

// 230 feedings an hour apart, 20 water tests, and an import's worth of 150 notes all at one moment,
// with a test and a dose at that same moment too
db.insert(events).values(Array.from({ length: 230 }, (_, i) => ({ tankId: tank.id, category: 'feeding' as const, occurredAt: iso(t0 + i * HOUR), data: {} }))).run();
db.insert(tests).values(Array.from({ length: 20 }, (_, i) => ({ tankId: tank.id, takenAt: iso(t0 + i * 10 * HOUR + 1000) }))).run();
const same = iso(t0 + 100 * HOUR + 500);
db.insert(events).values(Array.from({ length: 150 }, () => ({ tankId: tank.id, category: 'note' as const, occurredAt: same, data: {} }))).run();
db.insert(events).values({ tankId: tank.id, category: 'dosing', occurredAt: same, data: {} }).run();
db.insert(tests).values({ tankId: tank.id, takenAt: same }).run();
db.insert(events).values({ tankId: other.id, category: 'feeding', occurredAt: iso(t0), data: {} }).run();
const TOTAL = 230 + 20 + 150 + 1 + 1;

function walk(cat: string, since = '0000', limit?: number) {
	const keys: string[] = [];
	const ats: string[] = [];
	const sizes: number[] = [];
	let before = null as ReturnType<typeof parseCursor>;
	let remaining: number | null = null;
	for (let guard = 0; guard < 500; guard++) {
		const page = historyPage({ tankId: tank.id, since, cat, before, limit });
		// what "Show older" promised is what's there
		if (remaining != null) expect(page.entries.length + page.remaining).toBe(remaining);
		for (const e of page.entries) {
			keys.push(`${e.kind}:${e.row.id}`);
			ats.push(e.at);
		}
		sizes.push(page.entries.length);
		if (!page.next) break;
		remaining = page.remaining;
		// through the URL, as the link carries it
		before = parseCursor(cursorText(page.next));
		expect(before).toEqual(page.next);
	}
	return { keys, ats, sizes };
}

describe('History, a page at a time (#240)', () => {
	it('shows every entry once, newest first, a hundred to a page', () => {
		const { keys, ats, sizes } = walk('all');
		expect(keys).toHaveLength(TOTAL);
		expect(new Set(keys).size).toBe(TOTAL);
		expect(ats).toEqual(ats.toSorted().toReversed());
		expect(sizes).toEqual([100, 100, 100, 100, 2]);
	});

	it('keeps a run of entries at one moment whole across pages, tests before events', () => {
		const { keys, ats } = walk('all', '0000', 7);
		expect(new Set(keys).size).toBe(TOTAL);
		const at = ats.indexOf(same);
		expect(ats.lastIndexOf(same) - at + 1).toBe(152);
		expect(keys[at].startsWith('test:')).toBe(true);
	});

	it('filters by category and by range in the query', () => {
		expect(walk('note').keys).toHaveLength(150);
		expect(walk('test').keys).toHaveLength(21);
		expect(walk('test').keys.every((k) => k.startsWith('test:'))).toBe(true);
		expect(walk('dosing').keys).toHaveLength(1);
		expect(walk('health').keys).toEqual([]);
		// the last 30 feedings, and nothing of another tank's
		expect(walk('feeding', iso(t0 + 200 * HOUR)).keys).toHaveLength(30);
		expect(walk('all', iso(t0 + 229 * HOUR + 1)).keys).toEqual([]);
	});

	it('counts each category without loading the entries', () => {
		expect(historyCounts(tank.id, '0000')).toEqual({ all: TOTAL, test: 21, feeding: 230, note: 150, dosing: 1 });
		expect(historyCounts(tank.id, iso(t0 + 200 * HOUR))).toEqual({ all: 30, test: 0, feeding: 30 });
		expect(historyCounts(other.id, '0000')).toEqual({ all: 1, test: 0, feeding: 1 });
	});

	it('takes only a cursor it wrote', () => {
		expect(parseCursor('2026-01-01T00:00:00.000Z_event_3f2b6c1e-0000-4000-8000-000000000000')).toMatchObject({ kind: 'event' });
		for (const bad of [null, '', 'yesterday', '2026-01-01T00:00:00.000Z_page_1', "2026-01-01T00:00:00.000Z_test_x' or 1=1"]) expect(parseCursor(bad)).toBeNull();
	});
});
