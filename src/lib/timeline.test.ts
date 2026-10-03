import { describe, expect, it } from 'vitest';
import { gapLabel, gapSummary, nearestTest, readingChanges } from './timeline';

const prefs = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;
const no3 = { id: 'no3', key: 'no3', name: 'Nitrate', unit: 'ppm', decimals: 0, min: 5, max: 20 };
const ph = { id: 'ph', key: 'ph', name: 'pH', unit: '', decimals: 1, min: 6.5, max: 7.5 };

describe('nearestTest', () => {
	const tests = [{ takenAt: '2026-01-01T12:00:00Z' }, { takenAt: '2026-01-10T12:00:00Z' }, { takenAt: '2026-02-20T12:00:00Z' }];
	it('takes the latest test on or before the moment', () => {
		expect(nearestTest(tests, '2026-01-12T09:00:00Z')).toBe(1);
		expect(nearestTest(tests, '2026-01-10T12:00:00Z')).toBe(1);
	});
	it('falls back to the first after, within the limit', () => {
		expect(nearestTest(tests, '2025-12-30T09:00:00Z')).toBe(0);
		expect(nearestTest(tests, '2026-02-10T09:00:00Z')).toBe(2);
	});
	it('says none when every test is too far', () => {
		expect(nearestTest(tests, '2026-01-30T09:00:00Z')).toBe(null);
		expect(nearestTest([], '2026-01-30T09:00:00Z')).toBe(null);
		expect(nearestTest(tests, '2026-06-01T09:00:00Z')).toBe(null);
	});
});

describe('readingChanges', () => {
	it('lists the readings that read differently, in order', () => {
		const before = new Map([
			['no3', 20],
			['ph', 7.0]
		]);
		const after = new Map([
			['no3', 10],
			['ph', 7.04]
		]);
		expect(readingChanges([ph, no3], before, after, prefs)).toEqual([{ name: 'nitrate', from: '20', to: '10', unit: 'ppm' }]);
	});
	it('skips a parameter missing on either side', () => {
		expect(readingChanges([no3], new Map([['no3', 20]]), new Map(), prefs)).toEqual([]);
	});
});

describe('gapSummary', () => {
	const ev = (category: string, data: Record<string, unknown>) => ({ category, occurredAt: '2026-01-01T00:00:00Z', data });
	it('reads like the issue: livestock, care, plants, readings', () => {
		const events = [
			ev('livestock', { action: 'added', name: 'Otocinclus', count: 6 }),
			ev('water_change', { percent: 30 }),
			ev('water_change', { percent: 30 }),
			ev('water_change', { percent: 30 }),
			ev('maintenance', { actions: ['Trimmed plants'], plants: ['Rotala'] }),
			ev('feeding', { food: 'flakes' }),
			ev('note', {})
		];
		expect(gapSummary(events, [{ name: 'nitrate', from: '20', to: '10', unit: 'ppm' }])).toBe('+6 Otocinclus · 3 water changes · trimmed Rotala · nitrate 20 → 10 ppm');
	});
	it('merges the same species, counts losses and recounts, names plants and gear', () => {
		const events = [
			ev('livestock', { action: 'added', name: 'Neon tetra', count: 6 }),
			ev('livestock', { action: 'added', name: 'Neon tetra', count: 4 }),
			ev('livestock', { action: 'removed', name: 'Neon tetra', count: 1, reason: 'loss' }),
			ev('livestock', { action: 'recount', name: 'Amano shrimp', from: 5, to: 3 }),
			ev('livestock', { kind: 'plant', action: 'added', name: 'Java fern' }),
			ev('livestock', { kind: 'plant', action: 'removed', name: 'Duckweed' }),
			ev('equipment', { action: 'installed', item: 'Fluval 307' }),
			ev('maintenance', { actions: ['Cleaned filter'] }),
			ev('maintenance', { actions: ['Cleaned filter'] }),
			ev('dosing', { product: 'Excel' }),
			ev('health', {})
		];
		expect(gapSummary(events, [], 20)).toBe(
			'+10 Neon tetra · −1 Neon tetra · −2 Amano shrimp · planted Java fern · removed Duckweed · 1 dose · cleaned filter ×2 · installed Fluval 307 · 1 health entry'
		);
	});
	it('is empty when nothing counted happened', () => {
		expect(gapSummary([ev('note', {}), ev('feeding', {})])).toBe('');
	});
	it('stops at the limit', () => {
		const events = Array.from({ length: 3 }, (_, i) => ev('livestock', { action: 'added', name: `Fish ${i}`, count: 1 }));
		expect(gapSummary(events, [], 2)).toBe('+1 Fish 0 · +1 Fish 1');
	});
});

describe('gapLabel', () => {
	it('picks the unit by size', () => {
		expect(gapLabel(0)).toBe('the same day');
		expect(gapLabel(1)).toBe('1 day');
		expect(gapLabel(12)).toBe('12 days');
		expect(gapLabel(21)).toBe('3 weeks');
		expect(gapLabel(95)).toBe('3 months');
		expect(gapLabel(500)).toBe('16 months');
		expect(gapLabel(800)).toBe('2.2 years');
	});
});
