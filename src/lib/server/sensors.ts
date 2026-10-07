// Readings from sensors and controllers (#19): POST /api/v1/tanks/<id>/readings
// with a sensor token. Samples are stored metric in their own table, at most
// one a minute per parameter, and never raise an out-of-range alert on their own.
import { and, eq, gte, lt, or, sql } from 'drizzle-orm';
import { displayValue, type ParamLike } from '$lib/params';
import { fToC, ppmToDgh, type UnitPrefs } from '$lib/units';
import { db } from './db';
import { sensorHours, sensorReadings, tankParameters, type TankParameter } from './db/schema';

/** Samples closer together than this are dropped (a probe every second is noise, not data). */
export const MIN_GAP_MS = 60_000;
/** Samples are kept this long. */
export const KEEP_DAYS = 365;
/** A clock that's off: samples more than a day in the future or a year back are refused. */
const FUTURE_MS = 86_400_000;

export interface SampleIn {
	parameter: string;
	value: number;
	unit?: string | null;
	at?: string | null;
}

export type SampleResult = { ok: true; parameter: string; stored: boolean; value: number } | { ok: false; parameter: string; error: string };

/** A sample's value in stored units, from the unit the sender gave: °F, ppm for hardness; anything else as it is. */
export function toStoredSample(p: Pick<TankParameter, 'key'>, value: number, unit: string | null | undefined): number {
	const u = (unit ?? '').trim().toLowerCase().replace(/\s+/g, '');
	if (p.key === 'temp' && (u === '°f' || u === 'f' || u === 'degf' || u === 'fahrenheit')) return fToC(value);
	if ((p.key === 'gh' || p.key === 'kh') && (u === 'ppm' || u === 'mg/l')) return ppmToDgh(value);
	return value;
}

/** The body as sent: one sample, or { readings: [...] }. */
export function parseSamples(body: unknown): SampleIn[] | string {
	const list = body && typeof body === 'object' && Array.isArray((body as { readings?: unknown }).readings) ? (body as { readings: unknown[] }).readings : [body];
	if (list.length > 100) return 'At most 100 readings in one request.';
	const out: SampleIn[] = [];
	for (const raw of list) {
		if (!raw || typeof raw !== 'object') return 'Each reading is an object: { "parameter": "temp", "value": 25.4 }.';
		const r = raw as Record<string, unknown>;
		const parameter = typeof r.parameter === 'string' ? r.parameter.trim() : '';
		const value = typeof r.value === 'number' ? r.value : typeof r.value === 'string' ? Number(r.value.replace(',', '.')) : NaN;
		if (!parameter) return 'Each reading needs a "parameter": its key (temp, ph, no3…) or name.';
		if (!Number.isFinite(value)) return `"${parameter}": "value" must be a number.`;
		const at = typeof r.at === 'string' ? r.at : null;
		if (at && Number.isNaN(Date.parse(at))) return `"${parameter}": "at" must be an ISO 8601 time, e.g. 2026-10-03T14:05:00Z.`;
		out.push({ parameter, value, unit: typeof r.unit === 'string' ? r.unit : null, at });
	}
	return out;
}

/**
 * Store a tank's samples. A parameter is matched by key or name among the
 * tank's parameters; a sample within a minute of the last stored one for that
 * parameter is accepted but not stored (`stored: false`).
 */
export function recordSamples(tankId: string, samples: SampleIn[], source: string, tokenId: string | null, now = Date.now()): SampleResult[] {
	const params = db.select().from(tankParameters).where(eq(tankParameters.tankId, tankId)).all();
	const find = (name: string) => {
		const n = name.toLowerCase();
		return params.find((p) => p.key === n) ?? params.find((p) => p.name.toLowerCase() === n);
	};
	const label = (p: TankParameter) => (p.key === 'custom' ? p.name : p.key);

	// 1. every reading checked and converted first, so a bad one never stops the rest (#113)
	type Ok = { p: TankParameter; t: number; value: number };
	const checked: (Ok | SampleResult)[] = samples.map((s) => {
		const p = find(s.parameter);
		if (!p) return { ok: false, parameter: s.parameter, error: `No parameter "${s.parameter}" on this tank. It has: ${params.map((x) => `${x.key === 'custom' ? x.name : x.key} (${x.name})`).join(', ')}.` };
		const t = s.at ? Date.parse(s.at) : now;
		if (t > now + FUTURE_MS) return { ok: false, parameter: s.parameter, error: '"at" is in the future.' };
		if (t < now - KEEP_DAYS * 86_400_000) return { ok: false, parameter: s.parameter, error: `"at" is more than ${KEEP_DAYS} days ago.` };
		const value = toStoredSample(p, s.value, s.unit);
		if (!Number.isFinite(value)) return { ok: false, parameter: s.parameter, error: 'Not a number.' };
		return { p, t, value };
	});
	const valid = checked.filter((c): c is Ok => 'p' in c);
	if (!valid.length) return checked as SampleResult[];

	// 2. stored in one write transaction, taken before reading (BEGIN IMMEDIATE), so a
	// second request waits for this one instead of reading the same gaps
	return db.transaction(
		(tx) => {
			// the stored samples near any incoming one, in a single query
			const near = (p: TankParameter, t: number) =>
				and(eq(sensorReadings.parameterId, p.id), gte(sensorReadings.at, new Date(t - MIN_GAP_MS).toISOString()), lt(sensorReadings.at, new Date(t + MIN_GAP_MS).toISOString()));
			const taken = new Map<string, number[]>();
			for (const r of tx
				.select({ parameterId: sensorReadings.parameterId, at: sensorReadings.at })
				.from(sensorReadings)
				.where(and(eq(sensorReadings.tankId, tankId), or(...valid.map((v) => near(v.p, v.t)))))
				.all())
				(taken.get(r.parameterId) ?? taken.set(r.parameterId, []).get(r.parameterId)!).push(Date.parse(r.at));

			// the rolling one-a-minute rule, against what's stored and what this request already kept, in its order
			const rows: (typeof sensorReadings.$inferInsert)[] = [];
			const results = checked.map((c): SampleResult => {
				if (!('p' in c)) return c;
				const times = taken.get(c.p.id) ?? taken.set(c.p.id, []).get(c.p.id)!;
				if (times.some((e) => e >= c.t - MIN_GAP_MS && e < c.t + MIN_GAP_MS)) return { ok: true, parameter: label(c.p), stored: false, value: c.value };
				times.push(c.t);
				rows.push({ tankId, parameterId: c.p.id, value: c.value, at: new Date(c.t).toISOString(), source: source.slice(0, 60), tokenId });
				return { ok: true, parameter: label(c.p), stored: true, value: c.value };
			});
			if (rows.length) tx.insert(sensorReadings).values(rows).run();
			return results;
		},
		{ behavior: 'immediate' }
	);
}

/** The newest sample per parameter of a tank, with when and from what. */
export function latestSamples(tankId: string): Map<string, { value: number; at: string; source: string }> {
	return new Map(latestSamplesQuery(tankId).all().map((r) => [r.parameterId, r]));
}

/** The query behind latestSamples, apart so a test can read its plan. */
export function latestSamplesQuery(tankId: string) {
	// one indexed lookup per parameter (#99): the newest row from the end of
	// sensor_readings_tank_param_at, however many a year of samples there are
	const newest = sql`(select r.id from sensor_readings r where r.tank_id = ${tankParameters.tankId} and r.parameter_id = ${tankParameters.id} order by r.at desc limit 1)`;
	return db
		.select({ parameterId: sensorReadings.parameterId, value: sensorReadings.value, at: sensorReadings.at, source: sensorReadings.source })
		.from(tankParameters)
		.innerJoin(sensorReadings, eq(sensorReadings.id, newest))
		.where(eq(tankParameters.tankId, tankId));
}

/** A point on a sensor chart: the average of its span, and the span's lowest and highest (#103). */
export interface SamplePoint {
	t: number;
	v: number;
	lo?: number;
	hi?: number;
}

/**
 * Samples for a chart since an instant, oldest first, as at most `buckets`
 * points so a probe every minute draws as a line, not a wall. SQLite does the
 * bucketing (#103): equal spans from the first sample to `until`, each the
 * average with its lowest and highest, so a spike shows however long the range.
 * Spans of an hour or more read sensor_hours (60 times fewer rows); shorter
 * ones the samples, each span a range on the sensor index.
 */
export function sampleSeries(tankId: string, parameterId: string, since: string, buckets = 240, until = Date.now()): SamplePoint[] {
	const where = and(eq(sensorReadings.tankId, tankId), eq(sensorReadings.parameterId, parameterId), gte(sensorReadings.at, since));
	// the first sample is one step on the index; how many there are, from their hours
	const head = db.select({ first: sql<string | null>`min(${sensorReadings.at})` }).from(sensorReadings).where(where).get();
	if (!head?.first) return [];
	const many = db
		.select({ n: sql<number>`coalesce(sum(${sensorHours.n}), 0)` })
		.from(sensorHours)
		.where(and(eq(sensorHours.tankId, tankId), eq(sensorHours.parameterId, parameterId), gte(sensorHours.hour, head.first.slice(0, 13))))
		.get()!.n;
	if (many <= buckets) {
		return db
			.select({ value: sensorReadings.value, at: sensorReadings.at })
			.from(sensorReadings)
			.where(where)
			.orderBy(sensorReadings.at)
			.all()
			.map((r) => ({ t: Date.parse(r.at), v: r.value }));
	}
	const from = Date.parse(head.first);
	const span = Math.max(1, (until - from) / buckets);
	if (span >= HOUR_MS) return hourSeries(tankId, parameterId, from, span, buckets);
	// the edges as stored times; the last span runs on to any sample after `until`
	const edge = (i: number) => new Date(from + i * span).toISOString();
	const spans = sql.join(
		Array.from({ length: buckets }, (_, i) => sql`select ${i} as i, ${i === 0 ? head.first : edge(i)} as lo, ${i === buckets - 1 ? '9999' : edge(i + 1)} as hi`),
		sql` union all `
	);
	const rows = db.all<{ lo: string; hi: string; v: number; min: number; max: number }>(sql`
		with spans as (${spans})
		select min(r.at) as lo, max(r.at) as hi, avg(r.value) as v, min(r.value) as min, max(r.value) as max
		from spans s join ${sensorReadings} r on r.tank_id = ${tankId} and r.parameter_id = ${parameterId} and r.at >= s.lo and r.at < s.hi
		group by s.i order by s.i`);
	return rows.map((r) => ({ t: Math.round((Date.parse(r.lo) + Date.parse(r.hi)) / 2), v: r.v, lo: r.min, hi: r.max }));
}

const HOUR_MS = 3_600_000;
/** 'YYYY-MM-DDTHH', the UTC hour sensor_hours files a time under. */
const hourKey = (ms: number) => new Date(Math.floor(ms / HOUR_MS) * HOUR_MS).toISOString().slice(0, 13);

/** The same from whole hours: each span the hours that start in it. */
function hourSeries(tankId: string, parameterId: string, from: number, span: number, buckets: number): SamplePoint[] {
	const edge = (i: number) => hourKey(from + i * span);
	const spans = sql.join(
		Array.from({ length: buckets }, (_, i) => sql`select ${i} as i, ${edge(i)} as lo, ${i === buckets - 1 ? '9999' : edge(i + 1)} as hi`),
		sql` union all `
	);
	const rows = db.all<{ first: string; last: string; n: number; total: number; lo: number; hi: number }>(sql`
		with spans as (${spans})
		select min(h.hour) as first, max(h.hour) as last, sum(h.n) as n, sum(h.total) as total, min(h.lo) as lo, max(h.hi) as hi
		from spans s join ${sensorHours} h on h.tank_id = ${tankId} and h.parameter_id = ${parameterId} and h.hour >= s.lo and h.hour < s.hi
		group by s.i order by s.i`);
	return rows.map((r) => ({
		// the middle of its hours
		t: Math.round((Date.parse(`${r.first}:00:00Z`) + Date.parse(`${r.last}:00:00Z`) + HOUR_MS) / 2),
		v: r.total / r.n,
		lo: r.lo,
		hi: r.hi
	}));
}

/** Chart points in the person's units, the span's lowest and highest with them. */
export function displaySamples(points: SamplePoint[], p: ParamLike, prefs: UnitPrefs): SamplePoint[] {
	return points.map((s) => ({
		t: s.t,
		v: displayValue(p, s.v, prefs),
		...(s.lo != null && s.hi != null ? { lo: displayValue(p, s.lo, prefs), hi: displayValue(p, s.hi, prefs) } : {})
	}));
}

/**
 * How many samples a parameter has at all, counted up to `upTo`: an empty
 * chart says to try a longer range when the probe has data elsewhere (#130).
 */
export function sampleCount(tankId: string, parameterId: string, upTo = 2): number {
	const row = db.get<{ n: number }>(sql`
		select count(*) as n from (
			select 1 from ${sensorReadings}
			where ${sensorReadings.tankId} = ${tankId} and ${sensorReadings.parameterId} = ${parameterId}
			limit ${upTo})`);
	return row?.n ?? 0;
}

/** How many samples a tank has, and since when, for the Sensors page. */
export function sampleCounts(tankId: string): { count: number; first: string | null; sources: string[] } {
	const row = db.select({ n: sql<number>`count(*)`, first: sql<string | null>`min(${sensorReadings.at})` }).from(sensorReadings).where(eq(sensorReadings.tankId, tankId)).get();
	const sources = db.selectDistinct({ source: sensorReadings.source }).from(sensorReadings).where(eq(sensorReadings.tankId, tankId)).all().map((r) => r.source);
	return { count: row?.n ?? 0, first: row?.first ?? null, sources };
}

/** Samples older than a year go. */
export function pruneSamples(now = Date.now()) {
	return db.delete(sensorReadings).where(lt(sensorReadings.at, new Date(now - KEEP_DAYS * 86_400_000).toISOString())).run().changes;
}
