import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Source water (#315): named sources with dated tests, compared with the tank's
// latest readings parameter by parameter (same parameter, same unit); never the
// tank's latest reading, and back with a restored backup.
const dir = mkdtempSync(join(tmpdir(), 'wl-water-sources-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const s = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser, getUser } = await import('./users');
const { createTank, listParams } = await import('./tanks');
const { createTest, latestReadings } = await import('./logs');
const { addSource, addSourceTest, deleteSource, listSources, sourceComparison } = await import('./water-sources');
const { startExport } = await import('./export');
const { previewRestore, restoreBackup } = await import('./restore');
const { fmtValue } = await import('$lib/params');

const me = getUser(upsertUser({ email: 'source@example.com', name: 'Source', googleSub: 'g-source' }).id)!;
const tank = createTank(me, { name: 'Soft water tank', type: 'freshwater', nominalVolumeL: 100 });
const p = (key: string) => listParams(tank.id).find((x) => x.key === key)!;
const at = (d: string) => `${d}T12:00:00.000Z`;

describe('source water (#315)', () => {
	it('compares each source with the tank, by the tank’s own parameters', () => {
		createTest(me.id, tank.id, { takenAt: at('2026-11-10'), note: null, readings: new Map([[p('no3').id, 20], [p('ph').id, 6.8]]) }, { timeZone: 'UTC' });
		const tap = addSource(me.id, tank.id, { name: 'Kitchen tap', kind: 'tap', note: null });
		const ro = addSource(me.id, tank.id, { name: 'RO unit', kind: 'ro', note: null });
		addSourceTest(me.id, tank.id, tap.id, { takenAt: at('2026-06-01'), note: null, readings: new Map([[p('gh').id, 14]]) });
		// nitrate 60 in the tap: out of range for the tank, but a source isn't graded or alerted on
		addSourceTest(me.id, tank.id, tap.id, { takenAt: at('2026-11-01'), note: 'after rain', readings: new Map([[p('no3').id, 60], ['not-a-param', 1]]) });
		addSourceTest(me.id, tank.id, ro.id, { takenAt: at('2026-11-02'), note: null, readings: new Map([[p('gh').id, 0]]) });

		const [tapRow, roRow] = listSources(me.id, tank.id);
		expect(tapRow.tests.map((t) => t.note)).toEqual(['after rain', null]);
		const rows = sourceComparison(tank.id, tapRow.tests);
		const by = Object.fromEntries(rows.map((r) => [r.param.key, r]));
		expect(by.no3).toMatchObject({ source: { value: 60 }, tank: { value: 20 } });
		// GH from the older test, the newest that read it; the tank has none
		expect(by.gh).toMatchObject({ source: { value: 14, takenAt: at('2026-06-01') }, tank: null });
		expect(by.ph).toBeUndefined();
		expect(sourceComparison(tank.id, roRow.tests).map((r) => [r.param.key, r.source.value])).toEqual([['gh', 0]]);
		// never the tank's reading
		expect(latestReadings(tank.id).get(p('no3').id)?.value).toBe(20);
		expect(latestReadings(tank.id).get(p('gh').id)).toBeUndefined();
	});

	it('shows in the keeper’s units', () => {
		const gh = p('gh');
		expect(fmtValue(gh, 14, { unitSystem: 'metric', hardnessUnit: 'dgh' })).toMatch(/^14/);
		expect(fmtValue(gh, 14, { unitSystem: 'imperial', hardnessUnit: 'ppm' })).toMatch(/^250/);
	});

	it('comes back with a restored backup, pointing at the new tank’s parameters', async () => {
		const row = startExport(me, 'tank', tank.id, 'zip');
		let zip: Buffer | null = null;
		for (let i = 0; i < 400 && !zip; i++) {
			const r = db.select().from(s.exports).where(eq(s.exports.id, row.id)).get()!;
			if (r.status === 'ready') zip = readFileSync(join(dir, 'exports', `${row.id}.zip`));
			else await new Promise((res) => setTimeout(res, 25));
		}
		const other = getUser(upsertUser({ email: 'source-restore@example.com', name: 'Restorer', googleSub: 'g-source-restore' }).id)!;
		const pv = previewRestore(other, zip!);
		const [made] = await restoreBackup(other, pv.token, [tank.id]);
		const sources = listSources(other.id, made.id);
		expect(sources.map((x) => x.source.name)).toEqual(['Kitchen tap', 'RO unit']);
		const newNo3 = listParams(made.id).find((x) => x.key === 'no3')!;
		expect(sourceComparison(made.id, sources[0].tests).find((r) => r.param.id === newNo3.id)?.source.value).toBe(60);
	});

	it('deletes a source with its tests, and is its owner’s only', () => {
		const friend = upsertUser({ email: 'source-friend@example.com', name: 'Friend', googleSub: 'g-source-friend' });
		const [tapRow] = listSources(me.id, tank.id);
		expect(() => listSources(friend.id, tank.id)).toThrow();
		expect(() => addSource(friend.id, tank.id, { name: 'Mine', kind: 'well', note: null })).toThrow();
		deleteSource(me.id, tank.id, tapRow.source.id);
		expect(db.select().from(s.sourceTests).where(eq(s.sourceTests.sourceId, tapRow.source.id)).all()).toEqual([]);
	});
});
