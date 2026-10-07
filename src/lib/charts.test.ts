import { describe, expect, it } from 'vitest';
import { chartDomain, equipmentTypeLookup, overlayKind } from './charts';

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
