// Readings from sensors and controllers (#19): POST /api/v1/tanks/<id>/readings
// with a sensor token. Samples are stored metric in their own table, at most
// one a minute per parameter, and never raise an out-of-range alert on their own.
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { fToC, ppmToDgh } from '$lib/units';
import { db } from './db';
import { sensorReadings, tankParameters, type TankParameter } from './db/schema';

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
	const rows = db
		.select({ parameterId: sensorReadings.parameterId, value: sensorReadings.value, at: sensorReadings.at, source: sensorReadings.source })
		.from(sensorReadings)
		.where(eq(sensorReadings.tankId, tankId))
		.orderBy(desc(sensorReadings.at))
		.all();
	const out = new Map<string, { value: number; at: string; source: string }>();
	for (const r of rows) if (!out.has(r.parameterId)) out.set(r.parameterId, r);
	return out;
}

/**
 * Samples for a chart since an instant, oldest first, averaged into at most
 * `buckets` spans so a probe every minute draws as a line, not a wall.
 */
export function sampleSeries(tankId: string, parameterId: string, since: string, buckets = 240, until = Date.now()): { t: number; v: number }[] {
	const rows = db
		.select({ value: sensorReadings.value, at: sensorReadings.at })
		.from(sensorReadings)
		.where(and(eq(sensorReadings.tankId, tankId), eq(sensorReadings.parameterId, parameterId), gte(sensorReadings.at, since)))
		.orderBy(sensorReadings.at)
		.all();
	if (rows.length <= buckets) return rows.map((r) => ({ t: Date.parse(r.at), v: r.value }));
	const from = Date.parse(rows[0].at);
	const span = Math.max(1, (until - from) / buckets);
	const out: { t: number; v: number }[] = [];
	let i = 0;
	while (i < rows.length) {
		const start = Date.parse(rows[i].at);
		const end = start + span;
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
