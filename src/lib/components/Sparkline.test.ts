import { describe, expect, it } from 'vitest';
import { sparkBand, sparkPoints } from './Sparkline.svelte';

describe('sparkPoints', () => {
	it('draws a flat series as a line across the middle', () => {
		expect(sparkPoints([20, 20, 20, 20])).toBe('0,12 100,12');
	});

	it('draws one reading as the same flat line', () => {
		expect(sparkPoints([7.2])).toBe('0,12 100,12');
	});

	it('spreads a series across the width, scaled to its own min and max', () => {
		// lowest at the bottom (22), highest at the top (2), both 2 in from the edge
		expect(sparkPoints([10, 30, 20])).toBe('0,22 50,2 100,12');
		expect(sparkPoints([5, 6, 7, 8, 9, 10, 11, 12]).split(' ')).toEqual([
			'0,22',
			'14.29,19.14',
			'28.57,16.29',
			'42.86,13.43',
			'57.14,10.57',
			'71.43,7.71',
			'85.71,4.86',
			'100,2'
		]);
	});

	it('draws nothing without readings', () => {
		expect(sparkPoints([])).toBe('');
	});
});

describe('sparkPoints with a target band', () => {
	it('scales to the band as well, so a reading above it sits above the band', () => {
		// readings 15 then 35, band 5–20: the scale runs 5–35
		expect(sparkPoints([15, 35], 5, 20)).toBe('0,15.33 100,2');
		expect(sparkBand([15, 35], 5, 20)).toEqual({ y: 12, height: 10 });
	});

	it('puts one reading at its height against the band, not in the middle', () => {
		expect(sparkPoints([0.04], 0.05, 0.2)).toBe('0,22 100,22');
	});

	it('draws a band with only a max from the bottom (ammonia ≤ 0.25)', () => {
		expect(sparkBand([0, 0, 0.5], null, 0.25)).toEqual({ y: 12, height: 10 });
	});

	it('draws no band without a target', () => {
		expect(sparkBand([1, 2])).toBeNull();
	});
});
