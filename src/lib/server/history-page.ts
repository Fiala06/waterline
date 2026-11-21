// One page of a tank's History (#240): tests and events together, newest
// first, a hundred at a time, with the category filter and the counts done in
// SQL. "Show older" carries a cursor (the last entry shown), so a page costs
// the same however long the tank has been logged.
import { and, count, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { events, tankParameters, testReadings, tests, type Event, type Test } from './db/schema';
import { CATEGORY_LABEL, LOG_TYPES } from '$lib/events';
import { FILTERS } from '$lib/history';
import { fold, likePattern } from '$lib/search';
import { EVENT_CATEGORIES, type EventCategory } from '$lib/types';

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

/** The part of History asked for (#312): from when, until when, and matching what. */
export interface HistoryWindow {
	/** entries from this time on (ISO); '0000' for all time */
	since: string;
	/** and before this time (ISO); none for up to now */
	until?: string | null;
	/** the search box's words, as typed; '' or none for everything */
	search?: string | null;
}

// ── Search (#312) ───────────────────────────────────────────────────────────
// Folded (accents and case aside, see $lib/search) and done in SQL, so counts
// and pages are of the matches. A test matches by its note or the parameters it
// read; an entry by its note, the words in it (a product, a food, an item, an
// action, a species, a tag; never an id) or its kind's name.

/** LIKE's escape character: one backslash (see likePattern) */
const ESC = sql.raw("escape '\\'");
const folded = (col: SQL) => sql`wl_fold(coalesce(${col}, ''))`;

/** The kinds of entry whose name has the words: "water change", "dose", "top off". */
function categoriesNamed(term: string): EventCategory[] {
	const t = fold(term);
	return EVENT_CATEGORIES.filter((c) =>
		[CATEGORY_LABEL[c], LOG_TYPES.find((l) => l.category === c)?.label, FILTERS.find((f) => f.key === c)?.label].some((l) => l && fold(l).includes(t))
	);
}

function testsMatching(term: string): SQL {
	const like = likePattern(term);
	return or(
		sql`${folded(sql`${tests.note}`)} like ${like} ${ESC}`,
		// "nitrate" finds the tests that read it
		sql`exists (select 1 from ${testReadings} join ${tankParameters} on ${tankParameters.id} = ${testReadings.parameterId} where ${testReadings.testId} = ${tests.id} and wl_fold(${tankParameters.name}) like ${like} ${ESC})`,
		fold('Water test').includes(fold(term)) ? sql`1` : undefined
	)!;
}

function eventsMatching(term: string): SQL {
	const like = likePattern(term);
	const named = categoriesNamed(term);
	return or(
		sql`${folded(sql`${events.note}`)} like ${like} ${ESC}`,
		// the words in its data: text values only, and not ids or the app's own markers
		sql`exists (select 1 from json_tree(${events.data}) j where j.type = 'text' and cast(j.key as text) not like '%id' and j.key not in ('system', 'client_id') and wl_fold(j.value) like ${like} ${ESC})`,
		named.length ? inArray(events.category, named) : undefined
	)!;
}

const testsIn = (tankId: string, w: HistoryWindow) =>
	and(eq(tests.tankId, tankId), gte(tests.takenAt, w.since), w.until ? lt(tests.takenAt, w.until) : undefined, w.search ? testsMatching(w.search) : undefined);
const eventsIn = (tankId: string, w: HistoryWindow) =>
	and(eq(events.tankId, tankId), gte(events.occurredAt, w.since), w.until ? lt(events.occurredAt, w.until) : undefined, w.search ? eventsMatching(w.search) : undefined);

/** How many entries before the window (and matching its search), for "42 older entries"; tests only, events only (of a category) or both. */
export function olderCount(tankId: string, w: HistoryWindow, cat: string): number {
	const before: HistoryWindow = { since: '0000', until: w.since, search: w.search };
	const nTests = cat === 'all' || cat === 'test' ? (db.select({ n: count() }).from(tests).where(testsIn(tankId, before)).get()?.n ?? 0) : 0;
	const nEvents =
		cat === 'test'
			? 0
			: (db
					.select({ n: count() })
					.from(events)
					.where(and(eventsIn(tankId, before), cat === 'all' ? undefined : eq(events.category, cat as EventCategory)))
					.get()?.n ?? 0);
	return nTests + nEvents;
}

export interface HistoryQuery extends HistoryWindow {
	tankId: string;
	/** 'all', 'test', or an event category */
	cat: string;
	before?: Cursor | null;
	limit?: number;
}

/** How many entries the range holds, by category: { all, test, water_change, … }. */
export function historyCounts(tankId: string, w: HistoryWindow): Record<string, number> {
	const nTests = db.select({ n: count() }).from(tests).where(testsIn(tankId, w)).get()?.n ?? 0;
	const counts: Record<string, number> = { all: nTests, test: nTests };
	const rows = db
		.select({ category: events.category, n: count() })
		.from(events)
		.where(eventsIn(tankId, w))
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
	const inTests = (c: Cursor | null) => and(testsIn(q.tankId, q), testsAfter(c));
	const inEvents = (c: Cursor | null) => and(eventsIn(q.tankId, q), q.cat === 'all' ? undefined : eq(events.category, q.cat as EventCategory), eventsAfter(c));
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
