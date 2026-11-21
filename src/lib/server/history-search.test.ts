import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Searching History (#312): notes, the words in an entry, the parameters a test
// read and the kinds of entry, accents and case aside, counted and paged in SQL,
// within the dates asked and the tank's own entries only.
const dir = mkdtempSync(join(tmpdir(), 'wl-history-search-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, tests } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { historyCounts, historyPage, olderCount } = await import('./history-page');
const { createTank, listParams } = await import('./tanks');
const { createTest } = await import('./logs');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'search@example.com', name: 'Search', googleSub: 'g-search' });
const tank = createTank(user, { name: 'Searched', type: 'planted', nominalVolumeL: 100 });
const other = createTank(user, { name: 'Elsewhere', type: 'planted', nominalVolumeL: 60 });
for (const t of [tank, other]) db.delete(events).where(eq(events.tankId, t.id)).run();
const at = (d: string) => `${d}T12:00:00.000Z`;
const add = (tankId: string, category: 'note' | 'maintenance' | 'dosing' | 'equipment' | 'top_off' | 'water_change', d: string, note: string | null, data: Record<string, unknown> = {}) =>
	db.insert(events).values({ tankId, category, occurredAt: at(d), note, data }).returning().get();

// an old one, two years back
const media = add(tank.id, 'maintenance', '2024-03-02', 'Swapped the filter media', { actions: ['Replaced media'], equipment_id: 'Prime-id-should-not-match' });
const heater = add(tank.id, 'equipment', '2026-05-01', null, { action: 'added', item: 'Eheim Jäger 50' });
const dose = add(tank.id, 'dosing', '2026-06-01', null, { product: 'Seachem Prime', amount: 5, unit: 'mL' });
const topoff = add(tank.id, 'top_off', '2026-06-02', null, { volume_l: 2 });
add(other.id, 'dosing', '2026-06-01', 'Prime in the other tank', { product: 'Seachem Prime' });
const no3 = listParams(tank.id).find((p) => p.key === 'no3')!;
const test = createTest(user.id, tank.id, { takenAt: at('2026-06-03'), note: 'After the trim', readings: new Map([[no3.id, 20]]) }, { timeZone: 'UTC' }).test;
// 130 notes about shrimp, for a search that runs to more than a page
db.insert(events)
	.values(Array.from({ length: 130 }, (_, i) => ({ tankId: tank.id, category: 'note' as const, occurredAt: new Date(Date.parse(at('2026-01-01')) + i * 3_600_000).toISOString(), note: `Shrimp molt ${i}`, data: {} })))
	.run();

const keys = (search: string, extra: { since?: string; until?: string; cat?: string } = {}) =>
	historyPage({ tankId: tank.id, since: extra.since ?? '0000', until: extra.until, search, cat: extra.cat ?? 'all', limit: 500 }).entries.map((e) => `${e.kind}:${e.row.id}`);

describe('searching History (#312)', () => {
	it('finds an entry by its note, its words, a test by what it read, and a kind by its name', () => {
		expect(keys('filter media')).toEqual([`event:${media.id}`]);
		expect(keys('PRIME')).toEqual([`event:${dose.id}`]); // the product, not an id; not the other tank's
		expect(keys('nitrate')).toEqual([`test:${test.id}`]);
		expect(keys('trim')).toEqual([`test:${test.id}`]);
		expect(keys('top off')).toEqual([`event:${topoff.id}`]);
		expect(keys('zzz nothing')).toEqual([]);
	});

	it('ignores accents and case either way', () => {
		expect(keys('jager')).toEqual([`event:${heater.id}`]);
		expect(keys('JÄGER')).toEqual([`event:${heater.id}`]);
	});

	it('counts and pages the matches, not the page shown', () => {
		const counts = historyCounts(tank.id, { since: '0000', search: 'shrimp' });
		expect(counts).toEqual({ all: 130, test: 0, note: 130 });
		const first = historyPage({ tankId: tank.id, since: '0000', search: 'shrimp', cat: 'all' });
		expect(first.entries).toHaveLength(100);
		expect(first.remaining).toBe(30);
		const second = historyPage({ tankId: tank.id, since: '0000', search: 'shrimp', cat: 'all', before: first.next });
		expect(second.entries).toHaveLength(30);
		expect(second.next).toBeNull();
	});

	it('within the dates asked, and says how many match before them', () => {
		expect(keys('media', { since: at('2025-01-01') })).toEqual([]);
		expect(olderCount(tank.id, { since: at('2025-01-01'), search: 'media' }, 'all')).toBe(1);
		expect(keys('prime', { since: '2026-06-01T00:00:00.000Z', until: '2026-06-02T00:00:00.000Z' })).toEqual([`event:${dose.id}`]);
		expect(keys('prime', { since: '2026-06-02T00:00:00.000Z' })).toEqual([]);
		expect(keys('', { since: '2026-06-02T00:00:00.000Z', until: '2026-06-03T00:00:00.000Z' })).toEqual([`event:${topoff.id}`]);
		expect(keys('prime', { cat: 'maintenance' })).toEqual([]);
	});
});
