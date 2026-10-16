// Water tests and events: create, read, edit, delete, and the activity feed.
import { error } from '@sveltejs/kit';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { additivesOf } from '$lib/events';
import { statusOf } from '$lib/params';
import { paramStatus } from '$lib/status';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import {
	events,
	tankParameters,
	tanks,
	testReadings,
	tests,
	type Event,
	type EventCategory,
	type TankParameter,
	type Test
} from './db/schema';
import { latestSamplesFor, outOfRangeSince } from './sensors';
import { getTank } from './tanks';
import { dateInZone } from '$lib/time';
import { clearByTest, completeTask, followLog, refollowEntry, triggerOf, unfollowEntry, userZone } from './tasks';
import { followEntryDate, removeEntryPhotoFiles } from './photos';

// ── Tests ───────────────────────────────────────────────────────────────────

export interface TestInput {
	takenAt: string;
	note: string | null;
	/** parameter id → stored (metric/dGH) value */
	readings: Map<string, number>;
	clientId?: string | null;
	/** made by an import, undone with it */
	importId?: string | null;
}

export function createTest(
	userId: string,
	tankId: string,
	input: TestInput,
	opts: { completeTaskId?: string | null; timeZone: string }
): { test: Test; count: number; outOfRange: number; duplicate: boolean } {
	getTank(userId, tankId, 'log');
	const params = paramsById(tankId);
	for (const id of input.readings.keys()) {
		if (!params.has(id)) error(400, 'Unknown parameter');
	}

	if (input.clientId) {
		const existing = db
			.select()
			.from(tests)
			.where(and(eq(tests.tankId, tankId), eq(tests.clientId, input.clientId)))
			.get();
		if (existing) return { test: existing, ...summarize(existing.id, params), duplicate: true };
	}

	const test = db.transaction((tx) => {
		const t = tx
			.insert(tests)
			.values({ tankId, takenAt: input.takenAt, note: input.note, clientId: input.clientId ?? null, importId: input.importId ?? null, loggedBy: userId })
			.returning()
			.get();
		if (input.readings.size) {
			tx.insert(testReadings)
				.values([...input.readings].map(([parameterId, value]) => ({ testId: t.id, parameterId, value })))
				.run();
		}
		return t;
	});
	const done = opts.completeTaskId ? completeTask(userId, opts.completeTaskId, { at: input.takenAt, logged: true, timeZone: opts.timeZone }) : null;
	// the tasks that follow a water test (#178), unless it's an import or a follower's own
	if (!input.importId && done?.scheduleMode !== 'after')
		followLog(tankId, { kind: 'test', date: dateInZone(input.takenAt, opts.timeZone), id: test.id }, opts.timeZone, done?.id);
	// a pause or a cadence for a while that lasts until a reading clears (#179)
	if (!input.importId) clearByTest(tankId, input.readings, dateInZone(input.takenAt, opts.timeZone), opts.timeZone);
	return { test, ...summarize(test.id, params), duplicate: false };
}

function paramsById(tankId: string) {
	const rows = db.select().from(tankParameters).where(eq(tankParameters.tankId, tankId)).all();
	return new Map(rows.map((p) => [p.id, p]));
}

function summarize(testId: string, params: Map<string, TankParameter>) {
	const readings = db.select().from(testReadings).where(eq(testReadings.testId, testId)).all();
	let outOfRange = 0;
	for (const r of readings) {
		const p = params.get(r.parameterId);
		if (p && statusOf(p, r.value).level === 'bad') outOfRange++;
	}
	return { count: readings.length, outOfRange };
}

export function getTest(userId: string, testId: string) {
	const row = db
		.select({ test: tests })
		.from(tests)
		.innerJoin(tanks, eq(tanks.id, tests.tankId))
		.where(and(eq(tests.id, testId), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Entry not found');
	const readings = db.select().from(testReadings).where(eq(testReadings.testId, testId)).all();
	return {
		test: row.test,
		readings: new Map(readings.map((r) => [r.parameterId, r.value])),
		/** values before the last edit that changed them ("was 40") */
		previous: new Map(readings.filter((r) => r.prevValue != null).map((r) => [r.parameterId, r.prevValue!]))
	};
}

export function updateTest(userId: string, testId: string, input: Omit<TestInput, 'clientId'>) {
	const { test, readings: before, previous } = getTest(userId, testId);
	requireRoleOn(userId, test.tankId, 'log');
	const params = paramsById(test.tankId);
	for (const id of input.readings.keys()) {
		if (!params.has(id)) error(400, 'Unknown parameter');
	}
	db.transaction((tx) => {
		tx.update(tests)
			.set({ takenAt: input.takenAt, note: input.note, editedAt: new Date().toISOString() })
			.where(eq(tests.id, testId))
			.run();
		if (input.takenAt !== test.takenAt) {
			followEntryDate({ testId }, input.takenAt);
			refollowEntry(testId, dateInZone(input.takenAt, userZone(userId)));
		}
		tx.delete(testReadings).where(eq(testReadings.testId, testId)).run();
		if (input.readings.size) {
			tx.insert(testReadings)
				.values(
					[...input.readings].map(([parameterId, value]) => {
						// a changed value remembers the old one; an unchanged one keeps its hint
						const old = before.get(parameterId);
						const prevValue = old != null && Math.abs(old - value) > 1e-9 ? old : (previous.get(parameterId) ?? null);
						return { testId, parameterId, value, prevValue };
					})
				)
				.run();
		}
	});
	return summarize(testId, params);
}

export function deleteTest(userId: string, testId: string) {
	const { test } = getTest(userId, testId);
	requireRoleOn(userId, test.tankId, 'log');
	removeEntryPhotoFiles({ testId });
	db.delete(tests).where(eq(tests.id, testId)).run();
	unfollowEntry(testId);
	return test;
}

/**
 * Latest reading per parameter (from the most recent test that has that
 * parameter). One lookup per parameter (#116): the tank's tests newest first
 * until one has it, and only for parameters with any reading at all.
 */
export function latestReadings(tankId: string) {
	return latestReadingsFor([tankId]).get(tankId)!;
}

/**
 * A parameter's latest reading: its newest test's, or, where the sensor is the
 * reading of record (Parameters & targets), its newest sample when that's newer.
 * `sensor` names the source then, and `since` says when its run of out-of-range
 * readings began, so an alert for it keeps one key while the stretch lasts.
 */
export type LatestReading = { value: number; takenAt: string; sensor?: string; since?: string };

/** The same for several tanks in one query (#105): tank id → parameter id → reading. */
export function latestReadingsFor(tankIds: string[]) {
	const out = new Map<string, Map<string, LatestReading>>(tankIds.map((id) => [id, new Map()]));
	if (!tankIds.length) return out;
	for (const r of latestReadingsQuery(tankIds).all()) out.get(r.tankId)?.set(r.parameterId, { value: r.value, takenAt: r.takenAt });
	// a sensor that is the reading of record: its latest sample, when newer than the latest test
	const record = db
		.select({ tankId: tankParameters.tankId, id: tankParameters.id, min: tankParameters.min, max: tankParameters.max })
		.from(tankParameters)
		.where(and(inArray(tankParameters.tankId, tankIds), eq(tankParameters.sensorRecord, true)))
		.all();
	if (record.length) {
		const samples = latestSamplesFor([...new Set(record.map((p) => p.tankId))]);
		for (const p of record) {
			const s = samples.get(p.tankId)?.get(p.id);
			if (!s) continue;
			const tank = out.get(p.tankId)!;
			const cur = tank.get(p.id);
			if (cur && Date.parse(cur.takenAt) >= Date.parse(s.at)) continue;
			const reading: LatestReading = { value: s.value, takenAt: s.at, sensor: s.source };
			if (paramStatus(s.value, p).level === 'bad') reading.since = outOfRangeSince(p.tankId, p.id, p)?.since ?? s.at;
			tank.set(p.id, reading);
		}
	}
	return out;
}

/** The query behind latestReadings, apart so a test can read its plan. */
export function latestReadingsQuery(tankIds: string | string[]) {
	const ids = typeof tankIds === 'string' ? [tankIds] : tankIds;
	const newest = sql`(select t.id from tests t where t.tank_id = ${tankParameters.tankId} and exists (select 1 from test_readings r where r.test_id = t.id and r.parameter_id = ${tankParameters.id}) order by t.taken_at desc limit 1)`;
	return db
		.select({ tankId: tankParameters.tankId, parameterId: testReadings.parameterId, value: testReadings.value, takenAt: tests.takenAt })
		.from(tankParameters)
		.innerJoin(tests, eq(tests.id, newest))
		.innerJoin(testReadings, and(eq(testReadings.testId, tests.id), eq(testReadings.parameterId, tankParameters.id)))
		.where(and(inArray(tankParameters.tankId, ids), sql`exists (select 1 from test_readings r where r.parameter_id = ${tankParameters.id})`));
}

export function latestTest(tankId: string) {
	return db.select().from(tests).where(eq(tests.tankId, tankId)).orderBy(desc(tests.takenAt)).get();
}

/** Tests since an instant, oldest first, each with its readings (parameter id → stored value). */
export function testsSince(tankId: string, since: string) {
	const list = db
		.select()
		.from(tests)
		.where(and(eq(tests.tankId, tankId), gte(tests.takenAt, since)))
		.orderBy(tests.takenAt)
		.all();
	const ids = list.map((t) => t.id);
	// grouped in one pass (#116), not filtered once per test
	const byTest = new Map<string, Map<string, number>>(ids.map((id) => [id, new Map()]));
	if (ids.length) for (const r of db.select().from(testReadings).where(inArray(testReadings.testId, ids)).all()) byTest.get(r.testId)?.set(r.parameterId, r.value);
	return list.map((test) => ({ test, readings: byTest.get(test.id)! }));
}

/** Readings for one parameter since an instant, oldest first. */
export function series(tankId: string, parameterId: string, since: string) {
	return db
		.select({ value: testReadings.value, takenAt: tests.takenAt })
		.from(testReadings)
		.innerJoin(tests, eq(tests.id, testReadings.testId))
		.where(
			and(eq(tests.tankId, tankId), eq(testReadings.parameterId, parameterId), gte(tests.takenAt, since))
		)
		.orderBy(tests.takenAt)
		.all();
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface EventInput {
	category: EventCategory;
	occurredAt: string;
	note: string | null;
	data: Record<string, unknown>;
	clientId?: string | null;
	/** made by an import, undone with it */
	importId?: string | null;
}

/** The entry an offline-queued form already created, if it was sent before. */
export function eventByClientId(tankId: string, clientId: string): Event | undefined {
	return db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.clientId, clientId)))
		.get();
}

export function createEvent(
	userId: string,
	tankId: string,
	input: EventInput,
	opts: { completeTaskId?: string | null; timeZone: string }
): { event: Event; duplicate: boolean } {
	getTank(userId, tankId, 'log');
	const existing = input.clientId ? eventByClientId(tankId, input.clientId) : undefined;
	if (existing) return { event: existing, duplicate: true };
	const event = db
		.insert(events)
		.values({ ...input, tankId, clientId: input.clientId ?? null, importId: input.importId ?? null, loggedBy: userId })
		.returning()
		.get();
	const done = opts.completeTaskId ? completeTask(userId, opts.completeTaskId, { at: input.occurredAt, eventId: event.id, timeZone: opts.timeZone }) : null;
	// the tasks that follow a water change, a dose or maintenance (#178), unless it's an
	// import or a follower's own (chains stop after one step)
	const trigger = triggerOf(input.category, input.data);
	if (trigger && !input.importId && done?.scheduleMode !== 'after')
		followLog(tankId, { ...trigger, date: dateInZone(input.occurredAt, opts.timeZone), id: event.id }, opts.timeZone, done?.id);
	return { event, duplicate: false };
}

export function getEvent(userId: string, eventId: string): Event {
	const row = db
		.select({ event: events })
		.from(events)
		.innerJoin(tanks, eq(tanks.id, events.tankId))
		.where(and(eq(events.id, eventId), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Entry not found');
	return row.event;
}

export function updateEvent(
	userId: string,
	eventId: string,
	patch: Pick<EventInput, 'occurredAt' | 'note' | 'data'>
) {
	const before = getEvent(userId, eventId);
	requireRoleOn(userId, before.tankId, 'log');
	const updated = db
		.update(events)
		.set({ ...patch, editedAt: new Date().toISOString() })
		.where(eq(events.id, eventId))
		.returning()
		.get();
	if (patch.occurredAt !== before.occurredAt) {
		followEntryDate({ eventId }, patch.occurredAt);
		refollowEntry(eventId, dateInZone(patch.occurredAt, userZone(userId)));
	}
	return updated;
}

export function deleteEvent(userId: string, eventId: string) {
	const e = getEvent(userId, eventId);
	requireRoleOn(userId, e.tankId, 'log');
	removeEntryPhotoFiles({ eventId });
	db.delete(events).where(eq(events.id, eventId)).run();
	unfollowEntry(eventId);
	return e;
}

export function lastEventOf(tankId: string, category: EventCategory) {
	return db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, category)))
		.orderBy(desc(events.occurredAt))
		.get();
}

export function eventsSince(tankId: string, categories: EventCategory[], since: string) {
	return db
		.select()
		.from(events)
		.where(
			and(eq(events.tankId, tankId), inArray(events.category, categories), gte(events.occurredAt, since))
		)
		.orderBy(events.occurredAt)
		.all();
}

/** Recently used dosing products, most recent first. */
export function recentDosingProducts(tankId: string, limit = 6) {
	const rows = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, 'dosing')))
		.orderBy(desc(events.occurredAt))
		.limit(50)
		.all();
	const seen = new Map<string, { product: string; amount: unknown; unit: unknown; at: string }>();
	for (const e of rows) {
		const product = String(e.data.product ?? '').trim();
		if (product && !seen.has(product.toLowerCase())) {
			seen.set(product.toLowerCase(), { product, amount: e.data.amount, unit: e.data.unit, at: e.occurredAt });
		}
	}
	return [...seen.values()].slice(0, limit);
}

/** Foods fed recently (by hand or by a feeding routine), most recent first. */
export function recentFoods(tankId: string, limit = 6) {
	const rows = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, 'feeding')))
		.orderBy(desc(events.occurredAt))
		.limit(50)
		.all();
	const seen = new Map<string, { food: string; amount: unknown; unit: unknown; at: string }>();
	for (const e of rows) {
		const food = String(e.data.food ?? '').trim();
		if (food && !seen.has(food.toLowerCase())) seen.set(food.toLowerCase(), { food, amount: e.data.amount, unit: e.data.unit, at: e.occurredAt });
	}
	return [...seen.values()].slice(0, limit);
}

/** Products added to recent water changes, most recent first (for the datalist). */
export function recentAdditives(tankId: string, limit = 6) {
	const rows = db
		.select()
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, 'water_change')))
		.orderBy(desc(events.occurredAt))
		.limit(50)
		.all();
	const seen = new Map<string, { product: string; amount: unknown; unit: unknown; at: string }>();
	for (const e of rows) {
		for (const a of additivesOf(e.data)) {
			if (!seen.has(a.product.toLowerCase())) seen.set(a.product.toLowerCase(), { product: a.product, amount: a.amount, unit: a.unit, at: e.occurredAt });
		}
	}
	return [...seen.values()].slice(0, limit);
}

// ── Activity feed ───────────────────────────────────────────────────────────

export type FeedItem =
	| { kind: 'test'; id: string; at: string; test: Test; count: number; outOfRange: number }
	| { kind: 'event'; id: string; at: string; event: Event };

export function recentActivity(tankId: string, limit = 5): FeedItem[] {
	const params = paramsById(tankId);
	const t = db
		.select()
		.from(tests)
		.where(eq(tests.tankId, tankId))
		.orderBy(desc(tests.takenAt))
		.limit(limit)
		.all()
		.map((test) => ({ kind: 'test' as const, id: test.id, at: test.takenAt, test, ...summarize(test.id, params) }));
	const e = db
		.select()
		.from(events)
		.where(eq(events.tankId, tankId))
		.orderBy(desc(events.occurredAt))
		.limit(limit)
		.all()
		.map((event) => ({ kind: 'event' as const, id: event.id, at: event.occurredAt, event }));
	return [...t, ...e].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
