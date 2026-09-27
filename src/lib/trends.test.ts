import { describe, expect, it } from 'vitest';
import { trendNote } from './trends';

const prefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
const DAY = 86_400_000;
const nitrate = { id: 'no3', key: 'no3', name: 'Nitrate', unit: 'ppm', decimals: 0, min: 5, max: 20 };
const kh = { id: 'kh', key: 'kh', name: 'KH', unit: 'dKH', decimals: 0, min: 2, max: 5 };
const ammonia = { id: 'nh3', key: 'nh3', name: 'Ammonia', unit: 'ppm', decimals: 2, min: 0, max: 0.25 };
/** Readings a few days apart, oldest first. */
const pts = (values: number[], every = 3) => values.map((value, i) => ({ t: Date.UTC(2026, 8, 1) + i * every * DAY, value }));

describe('trendNote', () => {
	it('says nothing without a run or a pace worth mentioning', () => {
		expect(trendNote(nitrate, pts([10]), { prefs })).toBeNull();
		expect(trendNote(nitrate, pts([10, 14, 11, 13]), { prefs })).toBeNull();
		// two rises in a row isn't a run yet
		expect(trendNote(nitrate, pts([12, 9, 10, 11]), { prefs })).toBeNull();
	});

	it('names a run of tests that each rose', () => {
		// a week apart, 20 ppm is weeks away; and flat ends the run: 12 → 12 doesn't count
		const n = trendNote(nitrate, pts([12, 12, 13, 14, 15], 7), { prefs })!;
		expect(n.text).toBe('Nitrate has risen in each of your last 3 tests: 12 → 15 ppm.');
		expect(n.warn).toBe(false);
	});

	it('adds when the pace would cross a limit, and warns', () => {
		const n = trendNote(nitrate, pts([8, 10, 12, 14]), { prefs })!;
		expect(n.text).toBe('Nitrate has risen in each of your last 3 tests (8 → 14 ppm) and is on course to pass 20 ppm in about 9 days.');
		expect(n).toMatchObject({ direction: 'up', warn: true });
	});

	it('projects from the last water change, which resets the pace', () => {
		// high before the change, then climbing again from 6
		const readings = [...pts([30, 34]), ...pts([6, 13, 11, 17]).map((x) => ({ ...x, t: x.t + 7 * DAY }))];
		const n = trendNote(nitrate, readings, { prefs, since: readings[2].t })!;
		expect(n.text).toMatch(/^Nitrate is on course to pass 20 ppm in about \d+ days\.$/);
		expect(n.warn).toBe(true);
	});

	it('warns about a falling buffer, but not about ammonia heading for 0', () => {
		expect(trendNote(kh, pts([5, 4, 3, 3]), { prefs })).toBeNull(); // the run stopped
		const falling = trendNote(kh, pts([7, 6, 5, 4]), { prefs })!;
		expect(falling.text).toBe('KH has dropped in each of your last 3 tests (7 → 4 dKH) and is on course to drop below 2 dKH in about 6 days.');
		expect(falling.warn).toBe(true);
		const clearing = trendNote(ammonia, pts([0.5, 0.25, 0.15, 0.05]), { prefs })!;
		expect(clearing.text).toBe('Ammonia has dropped in each of your last 3 tests: 0.5 → 0.05 ppm.');
		expect(clearing.warn).toBe(false);
	});

	it('warns when it is already past a limit and still going', () => {
		const n = trendNote(nitrate, pts([22, 26, 31, 38]), { prefs })!;
		expect(n.text).toBe('Nitrate has risen in each of your last 3 tests: 22 → 38 ppm.');
		expect(n.warn).toBe(true);
	});

	it('compares readings as shown, in the keeper’s units', () => {
		const temp = { id: 't', key: 'temp', name: 'Temperature', unit: '°C', decimals: 1, min: 23.3, max: 26.7 };
		// 25.0, 25.1, 25.2 °C are all 77 °F: no run
		expect(trendNote(temp, pts([24.9, 25, 25.1, 25.2]), { prefs })).toBeNull();
	});
});
