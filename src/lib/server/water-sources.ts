// A tank's source water (#315): its tap, well, RO or remineralized mix, named
// and tested on its own, beside the tank's latest readings and targets. Never a
// tank reading: it isn't the latest, isn't graded or alerted on, doesn't
// complete a test reminder and isn't on shared pages. No History entry either:
// testing the tap doesn't change the tank. The tank's owner keeps them.
import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { sourceTests, waterSources, WATER_SOURCE_KINDS, type SourceTest, type WaterSource } from './db/schema';
import { latestReadings } from './logs';
import { getTank, listParams } from './tanks';

export type SourceKind = (typeof WATER_SOURCE_KINDS)[number];
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = { tap: 'Tap', well: 'Well', ro: 'RO / RODI', mix: 'Remineralized mix' };
export const isSourceKind = (v: unknown): v is SourceKind => (WATER_SOURCE_KINDS as readonly unknown[]).includes(v);

/** A source of this tank's, for its owner. */
export function getSource(userId: string, tankId: string, sourceId: string): WaterSource {
	getTank(userId, tankId, 'owner');
	const s = db.select().from(waterSources).where(and(eq(waterSources.id, sourceId), eq(waterSources.tankId, tankId))).get();
	if (!s) error(404, 'Source not found');
	return s;
}

/** The tank's sources, oldest first, each with its tests newest first. */
export function listSources(userId: string, tankId: string) {
	getTank(userId, tankId, 'owner');
	const sources = db.select().from(waterSources).where(eq(waterSources.tankId, tankId)).orderBy(waterSources.createdAt).all();
	const tests = sources.length
		? db
				.select()
				.from(sourceTests)
				.where(inArray(sourceTests.sourceId, sources.map((s) => s.id)))
				.orderBy(desc(sourceTests.takenAt))
				.all()
		: [];
	return sources.map((s) => ({ source: s, tests: tests.filter((t) => t.sourceId === s.id) }));
}

export function addSource(userId: string, tankId: string, input: { name: string; kind: SourceKind; note: string | null }) {
	getTank(userId, tankId, 'owner');
	return db.insert(waterSources).values({ ...input, tankId }).returning().get();
}

export function updateSource(userId: string, tankId: string, sourceId: string, input: { name: string; kind: SourceKind; note: string | null }) {
	getSource(userId, tankId, sourceId);
	return db.update(waterSources).set(input).where(eq(waterSources.id, sourceId)).returning().get();
}

/** The source and its tests. */
export function deleteSource(userId: string, tankId: string, sourceId: string) {
	getSource(userId, tankId, sourceId);
	db.delete(waterSources).where(eq(waterSources.id, sourceId)).run();
}

/** A test of a source: readings by the tank's parameter ids, already in their stored units. */
export function addSourceTest(userId: string, tankId: string, sourceId: string, input: { takenAt: string; note: string | null; readings: Map<string, number> }) {
	getSource(userId, tankId, sourceId);
	const known = new Set(listParams(tankId, { all: true }).map((p) => p.id));
	const readings = [...input.readings].filter(([id]) => known.has(id)).map(([parameter_id, value]) => ({ parameter_id, value }));
	return db.insert(sourceTests).values({ sourceId, tankId, takenAt: input.takenAt, note: input.note, readings }).returning().get();
}

export function deleteSourceTest(userId: string, tankId: string, testId: string) {
	getTank(userId, tankId, 'owner');
	const t = db.select().from(sourceTests).where(and(eq(sourceTests.id, testId), eq(sourceTests.tankId, tankId))).get();
	if (!t) error(404, 'Test not found');
	db.delete(sourceTests).where(eq(sourceTests.id, testId)).run();
	return t;
}

/** Older than this, a source's latest test is called stale (water from a tap or well changes with the seasons). */
export const SOURCE_STALE_DAYS = 90;

/**
 * Each of the tank's tracked parameters the source was tested for, with the
 * source's newest reading of it (from its newest test that has it), the tank's
 * latest reading and the tank's target: the same parameter, so the same unit.
 */
export function sourceComparison(tankId: string, tests: SourceTest[]) {
	const params = listParams(tankId);
	const tank = latestReadings(tankId);
	const rows = [];
	for (const p of params) {
		const t = tests.find((x) => x.readings.some((r) => r.parameter_id === p.id));
		if (!t) continue;
		const value = t.readings.find((r) => r.parameter_id === p.id)!.value;
		rows.push({ param: p, source: { value, takenAt: t.takenAt }, tank: tank.get(p.id) ?? null });
	}
	return rows;
}
