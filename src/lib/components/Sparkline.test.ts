import { describe, expect, it } from 'vitest';
import { sparkPoints } from './Sparkline.svelte';

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
