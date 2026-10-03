// The tank timeline (#26): the tank's photos in date order, each with the
// stats of that moment (the nearest water test, the running day, what lived
// in it), and what happened between one photo and the next. The public page
// uses the same with its switches applied.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { statusShort } from '$lib/status';
import { gapLabel, gapSummary, nearestTest, readingChanges } from '$lib/timeline';
import { dateInZone, daysBetween, fmtDateLong, tankAge } from '$lib/time';
import type { UnitPrefs } from '$lib/units';
import { db } from './db';
import { events, livestock, photoLivestock, photos, plants, tests, testReadings, type EventCategory, type Tank } from './db/schema';
import { listParams } from './tanks';

export interface MomentReading {
	name: string;
	value: string;
	unit: string;
	level: string;
	status: string;
}

export interface TimelineEntry {
	id: string;
	takenAt: string;
	/** the keeper's day, 'YYYY-MM-DD' */
	day: string;
	date: string;
	/** "Day 108", from the tank's start date */
	dayNumber: number | null;
	/** the nearest water test's readings, or null without one near enough */
	readings: MomentReading[] | null;
	testId: string | null;
	/** "tested that day", "tested 3 days earlier" */
	tested: string | null;
	animals: number;
	plants: number;
	/** since the photo before: how long, and what happened */
	gap: { label: string; days: number; summary: string } | null;
}

export interface TimelineOptions {
	/** the public page's switches: pets' names (and tagged photos), readings, and the activity between */
	names?: boolean;
	readings?: boolean;
	activity?: boolean;
	/** only these event categories count between photos (the public page's) */
	categories?: readonly string[];
	limit?: number;
}

const withoutPetNames = <E extends { data: Record<string, unknown> }>(e: E): E => ({ ...e, data: { ...e.data, nickname: null, previous: null } });

/** The timeline, oldest first. Anyone who can see the tank may build it; the caller checks. */
export function timelineEntries(tank: Tank, prefs: UnitPrefs & { timeZone: string }, opts: TimelineOptions = {}): TimelineEntry[] {
	const tz = prefs.timeZone;
	const names = opts.names ?? true;
	const showReadings = opts.readings ?? true;
	const showActivity = opts.activity ?? true;
	let list = db
		.select()
		.from(photos)
		.where(and(eq(photos.tankId, tank.id), eq(photos.inTimeline, true)))
		.orderBy(asc(photos.takenAt), asc(photos.id))
		.all();
	if (!names) {
		const tagged = new Set(
			db
				.select({ id: photoLivestock.photoId })
				.from(photoLivestock)
				.where(inArray(photoLivestock.photoId, list.map((p) => p.id)))
				.all()
				.map((r) => r.id)
		);
		list = list.filter((p) => !tagged.has(p.id));
	}
	if (opts.limit && list.length > opts.limit) list = list.slice(-opts.limit);
	if (!list.length) return [];

	const params = listParams(tank.id);
	const byParam = new Map(params.map((p) => [p.id, p]));
	const allTests = db.select().from(tests).where(eq(tests.tankId, tank.id)).orderBy(asc(tests.takenAt)).all();
	const readingRows = allTests.length
		? db
				.select()
				.from(testReadings)
				.where(
					inArray(
						testReadings.testId,
						allTests.map((t) => t.id)
					)
				)
				.all()
		: [];
	const readingsOf = new Map<string, Map<string, number>>();
	for (const r of readingRows) {
		if (!byParam.has(r.parameterId)) continue;
		const m = readingsOf.get(r.testId) ?? new Map<string, number>();
		m.set(r.parameterId, r.value);
		readingsOf.set(r.testId, m);
	}
	const allEvents = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tank.id), opts.categories ? inArray(events.category, [...opts.categories] as EventCategory[]) : undefined))
		.orderBy(asc(events.occurredAt))
		.all()
		.filter((e) => names || !(e.category === 'livestock' && e.data.action === 'named'))
		.map((e) => (names ? e : withoutPetNames(e)));

	// what lived in it on a day: added on or before, not yet removed (counts as they are now)
	const animals = db.select().from(livestock).where(eq(livestock.tankId, tank.id)).all();
	const greens = db.select().from(plants).where(eq(plants.tankId, tank.id)).all();
	const from = (addedAt: string | null, createdAt: string) => addedAt ?? dateInZone(createdAt, tz);
	const to = (removedAt: string | null) => (removedAt ? dateInZone(removedAt, tz) : null);
	const animalsOn = (day: string) =>
		animals.filter((l) => from(l.addedAt, l.createdAt) <= day && (to(l.removedAt) == null || to(l.removedAt)! > day)).reduce((n, l) => n + l.count, 0);
	const plantsOn = (day: string) => greens.filter((p) => dateInZone(p.createdAt, tz) <= day && (to(p.removedAt) == null || to(p.removedAt)! > day)).length;

	const out: TimelineEntry[] = [];
	let prev: { takenAt: string; day: string; test: number | null } | null = null;
	let ei = 0;
	for (const p of list) {
		const day = dateInZone(p.takenAt, tz);
		const ti = nearestTest(allTests, p.takenAt);
		const test = ti != null ? allTests[ti] : null;
		const values = test ? (readingsOf.get(test.id) ?? new Map<string, number>()) : null;
		const readings: MomentReading[] | null =
			showReadings && values && values.size
				? params
						.filter((pp) => values.has(pp.id))
						.map((pp) => {
							const st = statusOf(pp, values.get(pp.id));
							return { name: shortName(pp), value: fmtValue(pp, values.get(pp.id)!, prefs), unit: paramUnit(pp, prefs), level: st.level, status: statusShort(st) };
						})
				: null;
		let tested: string | null = null;
		if (readings && test) {
			const d = daysBetween(dateInZone(test.takenAt, tz), day);
			tested = d === 0 ? 'tested that day' : d > 0 ? `tested ${d} day${d === 1 ? '' : 's'} earlier` : `tested ${-d} day${d === -1 ? '' : 's'} later`;
		}
		let gap: TimelineEntry['gap'] = null;
		if (prev) {
			const between: typeof allEvents = [];
			while (ei < allEvents.length && allEvents[ei].occurredAt <= p.takenAt) {
				if (allEvents[ei].occurredAt > prev.takenAt) between.push(allEvents[ei]);
				ei++;
			}
			const moved =
				showReadings && prev.test != null && ti != null && prev.test !== ti
					? readingChanges(params, readingsOf.get(allTests[prev.test].id) ?? new Map(), readingsOf.get(allTests[ti].id) ?? new Map(), prefs)
					: [];
			const days = daysBetween(prev.day, day);
			gap = { label: gapLabel(days), days, summary: showActivity ? gapSummary(between, moved) : gapSummary([], moved) };
		}
		out.push({
			id: p.id,
			takenAt: p.takenAt,
			day,
			date: fmtDateLong(day),
			dayNumber: tankAge(tank.startDate, day).day,
			readings,
			testId: test && readings ? test.id : null,
			tested,
			animals: animalsOn(day),
			plants: plantsOn(day),
			gap
		});
		prev = { takenAt: p.takenAt, day, test: ti };
	}
	return out;
}

/** The entries by month, oldest first: "March 2026". */
export function byMonth(entries: TimelineEntry[]) {
	const months: { key: string; label: string; entries: TimelineEntry[] }[] = [];
	for (const e of entries) {
		const key = e.day.slice(0, 7);
		let m = months.at(-1);
		if (!m || m.key !== key) {
			m = { key, label: new Date(key + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), entries: [] };
			months.push(m);
		}
		m.entries.push(e);
	}
	return months;
}

/**
 * Before and after: two entries in date order, with what happened between
 * them (every photo's gap in between, folded into one).
 */
export function compareEntries(entries: TimelineEntry[], aId: string, bId: string) {
	const ia = entries.findIndex((e) => e.id === aId);
	const ib = entries.findIndex((e) => e.id === bId);
	if (ia < 0 || ib < 0 || ia === ib) return null;
	const [from, to] = ia < ib ? [ia, ib] : [ib, ia];
	const a = entries[from];
	const b = entries[to];
	const days = daysBetween(a.day, b.day);
	// the parts of each gap in between, without repeats, the readings' moves last
	const parts: string[] = [];
	const moves: string[] = [];
	for (const e of entries.slice(from + 1, to + 1)) {
		for (const part of e.gap?.summary.split(' · ') ?? []) {
			if (!part) continue;
			if (part.includes(' → ')) moves.push(part);
			else if (!parts.includes(part)) parts.push(part);
		}
	}
	// a reading that moved more than once: its first and last value
	const firstLast = new Map<string, { from: string; to: string }>();
	for (const m of moves) {
		const [name, rest] = [m.slice(0, m.indexOf(' ')), m.slice(m.indexOf(' ') + 1)];
		const [f, t] = rest.split(' → ');
		const prevMove = firstLast.get(name);
		firstLast.set(name, { from: prevMove?.from ?? f, to: t });
	}
	for (const [name, m] of firstLast) if (m.from.split(' ')[0] !== m.to.split(' ')[0]) parts.push(`${name} ${m.from} → ${m.to}`);
	return { a, b, days, label: gapLabel(days), summary: parts.slice(0, 8).join(' · ') };
}
