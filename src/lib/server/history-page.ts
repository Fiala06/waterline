// One page of a tank's History (#240): tests and events together, newest
// first, a hundred at a time, with the category filter and the counts done in
// SQL. "Show older" carries a cursor (the last entry shown), so a page costs
// the same however long the tank has been logged.
import { and, count, desc, eq, gte, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { events, tests, type Event, type Test } from './db/schema';
import type { EventCategory } from '$lib/types';

export const HISTORY_PAGE = 100;

/** Where a page left off: the time and identity of the last entry shown. */
export interface Cursor {
	at: string;
	kind: 'test' | 'event';
	id: string;
}

export const cursorText = (c: Cursor) => `${c.at}_${c.kind}_${c.id}`;

/** A cursor from `?before=`, or null when it isn't one. */
export function parseCursor(v: string | null | undefined): Cursor | null {
	const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_(test|event)_([A-Za-z0-9-]{1,64})$/.exec(v ?? '');
	return m ? { at: m[1], kind: m[2] as Cursor['kind'], id: m[3] } : null;
}

export type Entry = { kind: 'test'; at: string; row: Test } | { kind: 'event'; at: string; row: Event };

// The order: newest first; at the same moment tests before events, then by id, so every entry has one place.
const testsAfter = (c: Cursor | null): SQL | undefined => (c ? or(lt(tests.takenAt, c.at), c.kind === 'test' ? and(eq(tests.takenAt, c.at), lt(tests.id, c.id)) : undefined) : undefined);
const eventsAfter = (c: Cursor | null): SQL | undefined =>
	c ? or(lt(events.occurredAt, c.at), c.kind === 'test' ? eq(events.occurredAt, c.at) : and(eq(events.occurredAt, c.at), lt(events.id, c.id))) : undefined;

export interface HistoryQuery {
	tankId: string;
	/** entries from this time on (ISO); '0000' for all time */
	since: string;
	/** 'all', 'test', or an event category */
	cat: string;
	before?: Cursor | null;
	limit?: number;
}

/** How many entries the range holds, by category: { all, test, water_change, … }. */
export function historyCounts(tankId: string, since: string): Record<string, number> {
	const nTests = db.select({ n: count() }).from(tests).where(and(eq(tests.tankId, tankId), gte(tests.takenAt, since))).get()?.n ?? 0;
	const counts: Record<string, number> = { all: nTests, test: nTests };
	const rows = db
		.select({ category: events.category, n: count() })
		.from(events)
		.where(and(eq(events.tankId, tankId), gte(events.occurredAt, since)))
		.groupBy(events.category)
		.all();
	for (const r of rows) {
		counts[r.category] = r.n;
		counts.all += r.n;
	}
	return counts;
}

/**
 * The entries of one page, and what's left after it in the range: `next` is
 * the cursor for "Show older", `remaining` how many it leads to.
 */
export function historyPage(q: HistoryQuery): { entries: Entry[]; next: Cursor | null; remaining: number } {
	const limit = q.limit ?? HISTORY_PAGE;
	const before = q.before ?? null;
	const wantTests = q.cat === 'all' || q.cat === 'test';
	const wantEvents = q.cat !== 'test';
	const inTests = (c: Cursor | null) => and(eq(tests.tankId, q.tankId), gte(tests.takenAt, q.since), testsAfter(c));
	const inEvents = (c: Cursor | null) =>
		and(eq(events.tankId, q.tankId), gte(events.occurredAt, q.since), q.cat === 'all' ? undefined : eq(events.category, q.cat as EventCategory), eventsAfter(c));
	// one more than a page from each, so the merge knows whether anything follows
	const t: Entry[] = wantTests
		? db
				.select()
				.from(tests)
				.where(inTests(before))
				.orderBy(desc(tests.takenAt), desc(tests.id))
				.limit(limit + 1)
				.all()
				.map((row) => ({ kind: 'test', at: row.takenAt, row }))
		: [];
	const e: Entry[] = wantEvents
		? db
				.select()
				.from(events)
				.where(inEvents(before))
				.orderBy(desc(events.occurredAt), desc(events.id))
				.limit(limit + 1)
				.all()
				.map((row) => ({ kind: 'event', at: row.occurredAt, row }))
		: [];
	const merged = [...t, ...e].sort((a, b) => b.at.localeCompare(a.at) || (a.kind === b.kind ? b.row.id.localeCompare(a.row.id) : a.kind === 'test' ? -1 : 1));
	const entries = merged.slice(0, limit);
	const last = entries.at(-1);
	if (!last || merged.length <= limit) return { entries, next: null, remaining: 0 };
	const next: Cursor = { at: last.at, kind: last.kind, id: last.row.id };
	const n = (table: typeof tests | typeof events, where: SQL | undefined) => db.select({ n: sql<number>`count(*)` }).from(table).where(where).get()?.n ?? 0;
	const remaining = (wantTests ? n(tests, inTests(next)) : 0) + (wantEvents ? n(events, inEvents(next)) : 0);
	return { entries, next, remaining };
}
