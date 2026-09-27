import { describe, expect, it } from 'vitest';
import { nearestIndex, niceTicks } from './TrendChart.svelte';

describe('niceTicks', () => {
	it('picks round numbers near the count asked for', () => {
		expect(niceTicks(2, 33, 3)).toEqual([10, 20, 30]);
		expect(niceTicks(6.2, 7.8, 4)).toEqual([6.5, 7, 7.5]);
		expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
		expect(niceTicks(1240, 1410, 3)).toEqual([1250, 1300, 1350, 1400]);
	});

	it('never leaves just one number up the side', () => {
		for (const [lo, hi] of [
			[2, 33],
			[5.1, 5.9],
			[70, 82]
		]) {
			expect(niceTicks(lo, hi, 2).length).toBeGreaterThanOrEqual(2);
		}
	});

	it('has nothing to show for an empty span', () => {
		expect(niceTicks(3, 3, 3)).toEqual([]);
	});
});

describe('nearestIndex', () => {
	it("finds the reading nearest the pointer, at either end and between", () => {
		const xs = [10, 50, 90, 200];
		expect(nearestIndex(xs, -5)).toBe(0);
		expect(nearestIndex(xs, 29)).toBe(0);
		expect(nearestIndex(xs, 31)).toBe(1);
		expect(nearestIndex(xs, 150)).toBe(3);
		expect(nearestIndex(xs, 999)).toBe(3);
		expect(nearestIndex([42], 0)).toBe(0);
	});
});
