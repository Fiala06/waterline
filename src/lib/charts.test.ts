import { describe, expect, it } from 'vitest';
import { chartDomain } from './charts';

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
