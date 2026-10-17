import { describe, expect, it } from 'vitest';
import { chartDomain, TARGET_BAND, targetPosition } from './charts';

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
