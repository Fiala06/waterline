import { describe, expect, it } from 'vitest';
import { axisTitle, keyIndex, nearestIndex, niceTicks, readoutStatus, readoutWhen, tapWidths, tipStyle, zoneLabels } from './trend-chart';

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

// the rest of the chart's arithmetic and words, apart from its drawing (#120)
describe('the chart’s words and places', () => {
	const at = { top: 22, bandTop: 60, bandBottom: 140, baseline: 200, zero: 190 };

	it('names the zones that have room', () => {
		expect(zoneLabels({ min: 5, max: 20 }, 0, at).map((z) => [z.title, z.sub])).toEqual([
			['✕ High', 'over 20'],
			['✓ Target', '5–20'],
			['✕ Low', 'under 5']
		]);
		// 0 is best: a trace up to the limit, and 0 marked
		expect(zoneLabels({ min: 0, max: 0.25 }, 2, at).map((z) => z.title)).toEqual(['✕ High', '▲ Trace', '✓ 0 is best']);
		expect(zoneLabels({ min: null, max: 40 }, 0, at).map((z) => z.sub)).toEqual(['over 40', 'up to 40']);
		expect(zoneLabels({ min: 6, max: null }, 0, { ...at, bandTop: at.top }).map((z) => z.sub)).toEqual(['6 or more', 'under 6']);
		// a zone under 14px tall goes unnamed
		expect(zoneLabels({ min: 5, max: 20 }, 0, { ...at, bandTop: 30 }).map((z) => z.title)).toEqual(['✓ Target', '✕ Low']);
	});

	it('says how far out a reading is, and when it was taken', () => {
		expect(readoutStatus(35, { min: 5, max: 20 }, 0)).toBe('✕ 15 over target');
		expect(readoutStatus(6.2, { min: 6.5, max: 7.5 }, 1)).toBe('✕ 0.3 under target');
		expect(readoutStatus(10, { min: 5, max: 20 }, 0)).toBe('✓ In range');
		expect(readoutStatus(19.6, { min: 5, max: 20 }, 0)).toBe('▲ Near high');
		expect(readoutStatus(10, { min: null, max: null }, 0)).toBe('');
		const now = Date.parse('2026-10-07T18:00:00Z');
		expect(readoutWhen(Date.parse('2026-10-07T16:05:00Z'), 'UTC', true, now)).toBe('Today · 4:05 PM');
		expect(readoutWhen(Date.parse('2026-10-03T09:00:00Z'), 'UTC', false, now)).toBe('Oct 3, 2026');
		expect(axisTitle('Nitrate', 'ppm', 200)).toBe('Nitrate (ppm)');
		expect(axisTitle('Nitrate', 'ppm', 40)).toBe('ppm');
	});

	it('moves through the readings with the keys', () => {
		expect(keyIndex('End', null, 4)).toBe(4);
		expect(keyIndex('ArrowLeft', null, 4)).toBe(4);
		expect(keyIndex('ArrowLeft', 0, 4)).toBe(0);
		expect(keyIndex('ArrowRight', null, 4)).toBe(0);
		expect(keyIndex('ArrowUp', 4, 4)).toBe(4);
		expect(keyIndex('Home', 3, 4)).toBe(0);
		expect(keyIndex('Escape', 3, 4)).toBeNull();
		expect(keyIndex('Enter', 3, 4)).toBeUndefined();
	});

	it('keeps markers’ tap areas apart and the tooltip inside the chart', () => {
		expect(tapWidths([10, 20, 100])).toEqual([14, 14, 44]);
		expect(tapWidths([0, 30])).toEqual([30, 30]);
		expect(tipStyle(50, 200, 800)).toBe('left:50px;top:200px;transform:translate(0,calc(-100% - 14px))');
		expect(tipStyle(700, 50, 800)).toBe('left:700px;top:50px;transform:translate(-100%,14px)');
		expect(tipStyle(400, 50, 800)).toContain('translate(-50%,14px)');
	});
});
