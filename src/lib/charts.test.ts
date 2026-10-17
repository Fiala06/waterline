import { describe, expect, it } from 'vitest';
import { chartDomain, equipmentTypeLookup, overlayKind, parseCompare, TARGET_BAND, targetPosition } from './charts';

describe('chartDomain (#74)', () => {
	it('gives ammonia at 0 room up to twice its limit', () => {
		expect(chartDomain([0, 0, 0], { min: 0, max: 0.25 })).toEqual({ lo: 0, hi: 0.5 });
		// a high reading stays in view
		expect(chartDomain([0, 1], { min: 0, max: 0.25 }).hi).toBeCloseTo(1.1);
	});

	it('puts room on both sides of a target, never below 0', () => {
		const d = chartDomain([15, 18, 35], { min: 5, max: 20 });
		expect(d.lo).toBe(0);
		expect(d.hi).toBeCloseTo(36.5);
		const ph = chartDomain([6.9, 7.0], { min: 6, max: 7.8 });
		expect(ph.lo).toBeCloseTo(6 - 1.8 * 0.45);
		expect(ph.hi).toBeCloseTo(7.8 + 1.8 * 0.45);
	});

	it('keeps the target a band, never the whole chart', () => {
		for (const band of [{ min: 0, max: 0.25 }, { min: 5, max: 20 }, { min: 74, max: 80 }, { min: null, max: 10 }, { min: 2, max: null }]) {
			const d = chartDomain([band.min ?? band.max ?? 0], band);
			const lo = band.min ?? d.lo;
			const hi = band.max ?? d.hi;
			expect(hi - lo, JSON.stringify(band)).toBeLessThan(d.hi - d.lo);
		}
	});

	it('pads the readings when there is no target, and shows readings below 0', () => {
		expect(chartDomain([10, 20], { min: null, max: null })).toEqual({ lo: 8.8, hi: 21.2 });
		expect(chartDomain([5, 5], { min: null, max: null })).toEqual({ lo: 4, hi: 6 });
		expect(chartDomain([], { min: null, max: null })).toEqual({ lo: 0, hi: 1 });
		expect(chartDomain([-0.2, 0.1], { min: 0, max: 0.25 }).lo).toBe(-0.2);
	});
});

describe('targetPosition (all parameters on one chart)', () => {
	const { lo: L, hi: H } = TARGET_BAND;
	it('fills the shared band with each target', () => {
		expect(targetPosition(5, { min: 5, max: 20 })).toBeCloseTo(L);
		expect(targetPosition(20, { min: 5, max: 20 })).toBeCloseTo(H);
		expect(targetPosition(6.9, { min: 6, max: 7.8 })).toBeCloseTo((L + H) / 2);
	});

	it('puts High above the band and Low below it, never past the edges', () => {
		const hi = targetPosition(35, { min: 5, max: 20 })!;
		expect(hi).toBeGreaterThan(H);
		expect(hi).toBeCloseTo(H + (1 - H) / 2);
		expect(targetPosition(10_000, { min: 5, max: 20 })!).toBeLessThan(1);
		const low = targetPosition(1, { min: 5, max: 20 })!;
		expect(low).toBeLessThan(L);
		expect(targetPosition(-10_000, { min: 5, max: 20 })!).toBeGreaterThan(0);
	});

	it('keeps the order of the readings', () => {
		const ys = [-5, 0, 3, 5, 12, 20, 30, 80].map((v) => targetPosition(v, { min: 5, max: 20 })!);
		for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
	});

	it('starts a 0-is-best target (ammonia) at the bottom of the band', () => {
		expect(targetPosition(0, { min: 0, max: 0.25 })).toBeCloseTo(L);
		expect(targetPosition(0.25, { min: 0, max: 0.25 })).toBeCloseTo(H);
		expect(targetPosition(1, { min: 0, max: 0.25 })!).toBeGreaterThan(H);
	});

	it('reads a max on its own as 0 up to it', () => {
		expect(targetPosition(0, { min: null, max: 40 })).toBeCloseTo(L);
		expect(targetPosition(40, { min: null, max: 40 })).toBeCloseTo(H);
	});

	it('keeps anything over a min on its own inside the band', () => {
		expect(targetPosition(4, { min: 4, max: null })).toBeCloseTo(L);
		expect(targetPosition(400, { min: 4, max: null })!).toBeLessThan(H);
		expect(targetPosition(2, { min: 4, max: null })!).toBeLessThan(L);
	});

	it('leaves out a parameter without a target', () => {
		expect(targetPosition(10, { min: null, max: null })).toBeNull();
		expect(targetPosition(NaN, { min: 5, max: 20 })).toBeNull();
	});
});

describe('event overlays (#88)', () => {
	const type = equipmentTypeLookup([
		{ id: 'e1', name: 'Chihiros WRGB', type: 'light' },
		{ id: 'e2', name: 'CO₂ Art regulator', type: 'co2' },
		{ id: 'e3', name: 'Eheim 2217', type: 'filter' }
	]);

	it('sorts events into their overlay, and leaves out the kinds that never mark a chart', () => {
		expect(overlayKind({ category: 'water_change', data: { percent: 30 } }, type)).toBe('water_change');
		expect(overlayKind({ category: 'dosing', data: {} }, type)).toBe('dosing');
		expect(overlayKind({ category: 'maintenance', data: { actions: ['Trimmed plants', 'Scraped glass'] } }, type)).toBe('trim');
		expect(overlayKind({ category: 'maintenance', data: { actions: ['Cleaned filter'] } }, type)).toBe('maintenance');
		expect(overlayKind({ category: 'equipment', data: { action: 'schedule', equipment_id: 'e1', item: 'Chihiros WRGB' } }, type)).toBe('light');
		expect(overlayKind({ category: 'equipment', data: { action: 'adjusted', equipment_id: 'e2', item: 'CO₂ Art regulator' } }, type)).toBe('co2');
		expect(overlayKind({ category: 'equipment', data: { action: 'replaced', equipment_id: 'e3', item: 'Eheim 2217' } }, type)).toBeNull();
		expect(overlayKind({ category: 'observation', data: { kind: 'algae', algae: 'Black beard', severity: 'moderate' } }, type)).toBe('algae');
		for (const category of ['feeding', 'note', 'observation', 'livestock', 'health']) expect(overlayKind({ category, data: {} }, type)).toBeNull();
	});

	it('knows an item by id, then by name, then by what the name says', () => {
		expect(type('e1', 'renamed since')).toBe('light');
		expect(type(undefined, 'chihiros wrgb')).toBe('light');
		expect(type(undefined, 'Old LED light')).toBe('light');
		expect(type(undefined, 'CO2 diffuser')).toBe('co2');
		expect(type(undefined, 'Heater')).toBeNull();
	});
});

describe('parseCompare (#87)', () => {
	it('keeps known parameters other than the main one, at most two, in order, once each', () => {
		expect(parseCompare('b,c', ['a', 'b', 'c', 'd'], 'a')).toEqual(['b', 'c']);
		expect(parseCompare('a,b,b,x,c,d', ['a', 'b', 'c', 'd'], 'a')).toEqual(['b', 'c']);
		expect(parseCompare(' b , d', ['a', 'b', 'c', 'd'], 'a')).toEqual(['b', 'd']);
		expect(parseCompare(null, ['a'], 'a')).toEqual([]);
		expect(parseCompare('', ['a'], 'a')).toEqual([]);
	});
});
