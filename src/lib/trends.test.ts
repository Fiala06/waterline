import { describe, expect, it } from 'vitest';
import { patternNotes, trendNote } from './trends';

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

describe('patternNotes', () => {
	const start = Date.UTC(2026, 5, 1);
	const at = (day: number) => start + day * DAY;
	const ph = { id: 'ph', key: 'ph', name: 'pH', unit: '', decimals: 1, min: 6.5, max: 7.5 };

	/** KH that falls about 1 dKH a week after each weekly water change, back to 5 each time. */
	function khWeeks(weeks: number, fall = 1) {
		const points: { t: number; value: number }[] = [];
		const waterChanges: number[] = [];
		for (let w = 0; w < weeks; w++) {
			waterChanges.push(at(w * 7));
			points.push({ t: at(w * 7) + 3_600_000, value: 5 }, { t: at(w * 7 + 3), value: 5 - (fall * 3) / 7 }, { t: at(w * 7 + 6), value: 5 - (fall * 6) / 7 });
		}
		return { points, waterChanges };
	}

	it('names a drift between water changes', () => {
		const { points, waterChanges } = khWeeks(5);
		const [n] = patternNotes(kh, points, { waterChanges, doses: [] }, { prefs });
		expect(n).toMatchObject({ kind: 'drift', direction: 'down', warn: false });
		expect(n.text).toBe('KH drifts down about 1 dKH a week between water changes (in 5 of your last 5).');
	});

	it('needs 3 stretches that mostly agree, by an amount that shows', () => {
		const two = khWeeks(2);
		expect(patternNotes(kh, two.points, { waterChanges: two.waterChanges, doses: [] }, { prefs })).toEqual([]);
		// too small to show at whole dKH
		const tiny = khWeeks(5, 0.2);
		expect(patternNotes(kh, tiny.points, { waterChanges: tiny.waterChanges, doses: [] }, { prefs })).toEqual([]);
		// up, down, up, down: no pattern
		const mixed = khWeeks(4);
		for (const [i, pt] of mixed.points.entries()) if (Math.floor(i / 3) % 2) pt.value = 10 - pt.value;
		expect(patternNotes(kh, mixed.points, { waterChanges: mixed.waterChanges, doses: [] }, { prefs })).toEqual([]);
	});

	/** pH that holds steady from test to test, with a dose between some of them. */
	function doseDays(after: (i: number) => number) {
		const points: { t: number; value: number }[] = [];
		const doses: { t: number; product: string }[] = [];
		for (let i = 0; i < 4; i++) {
			const d = at(i * 5);
			// a test without a dose the day before, to compare with
			points.push({ t: d - DAY - 3_600_000, value: 7.0 }, { t: d - 3_600_000, value: 7.0 }, { t: d + 6 * 3_600_000, value: after(i) });
			doses.push({ t: d, product: i % 2 ? 'Excel' : 'excel ' });
		}
		return { points, doses };
	}

	it('names a change after dosing the same product', () => {
		const { points, doses } = doseDays((i) => (i === 3 ? 7.0 : 6.8));
		const [n] = patternNotes(ph, points, { waterChanges: [], doses }, { prefs });
		expect(n).toMatchObject({ kind: 'dose', direction: 'down' });
		expect(n.text).toBe('pH dips about 0.2 after dosing Excel (3 of 4 times).');
	});

	it('leaves out a dose with a water change between its tests, or without a test near it', () => {
		const { points, doses } = doseDays(() => 6.7);
		expect(patternNotes(ph, points, { waterChanges: [], doses }, { prefs })).toHaveLength(1);
		const wcs = [0, 5, 10, 15].map((day) => at(day) + 3_600_000);
		expect(patternNotes(ph, points, { waterChanges: wcs, doses }, { prefs }).filter((n) => n.kind === 'dose')).toEqual([]);
		expect(patternNotes(ph, points, { waterChanges: [], doses: doses.map((d) => ({ ...d, t: d.t + 3 * DAY })) }, { prefs })).toEqual([]);
	});

	it('says nothing when it changes that way between tests anyway, or with no test between doses to compare', () => {
		// dosed daily while nitrate climbs: every test follows a dose
		const points = Array.from({ length: 10 }, (_, i) => ({ t: at(i) + 12 * 3_600_000, value: 10 + i }));
		const doses = Array.from({ length: 10 }, (_, i) => ({ t: at(i) + 9 * 3_600_000, product: 'All-in-one' }));
		expect(patternNotes(nitrate, points, { waterChanges: [], doses }, { prefs })).toEqual([]);
		// the same rise with and without a dose
		const steady = Array.from({ length: 12 }, (_, i) => ({ t: at(i), value: 10 + i }));
		const some = [2, 5, 8, 11].map((i) => ({ t: at(i) - 3_600_000, product: 'All-in-one' }));
		expect(patternNotes(nitrate, steady, { waterChanges: [], doses: some }, { prefs })).toEqual([]);
	});
});
