import { describe, expect, it } from 'vitest';
import { niceTicks, yAxisTitle } from './charts';

describe('niceTicks', () => {
	it('picks round steps across the range', () => {
		expect(niceTicks(0, 40, 4)).toEqual([0, 10, 20, 30, 40]);
		expect(niceTicks(6.2, 7.8, 4)).toEqual([6.5, 7, 7.5]);
		expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});

	it('never leaves a single tick when a smaller step gives more', () => {
		// by 20s this is just 20
		expect(niceTicks(1.3, 38.2, 3)).toEqual([10, 20, 30]);
	});

	it('handles a range below zero', () => {
		expect(niceTicks(-2, 2, 4)).toEqual([-2, -1, 0, 1, 2]);
	});

	it('has no ticks for an empty range', () => {
		expect(niceTicks(5, 5, 4)).toEqual([]);
		expect(niceTicks(NaN, 5, 4)).toEqual([]);
	});

	it('keeps values clean of float noise', () => {
		for (const t of niceTicks(0.1, 0.7, 4)) expect(String(t).length).toBeLessThanOrEqual(4);
	});
});

describe('yAxisTitle', () => {
	it('gives the name and unit when they fit', () => {
		expect(yAxisTitle('Nitrate', 'ppm', 20)).toBe('Nitrate (ppm)');
		expect(yAxisTitle('pH', '', 20)).toBe('pH');
	});

	it('falls back to the unit, then a shortened name', () => {
		expect(yAxisTitle('Nitrate', 'ppm', 8)).toBe('ppm');
		expect(yAxisTitle('Total dissolved solids', '', 12)).toBe('Total disso…');
		expect(yAxisTitle('Nitrate', 'ppm', 0)).toBe('');
	});
});
