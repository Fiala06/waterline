import { describe, expect, it } from 'vitest';
import {
	cToF,
	dghToPpm,
	dropsAsPpm,
	formatNumber,
	fToC,
	galToL,
	lToGal,
	parseNumber,
	PPM_PER_DGH,
	toDisplay,
	toStored,
	unitLabel,
	type UnitPrefs
} from './units';

const imperialDgh: UnitPrefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' };
const metricPpm: UnitPrefs = { unitSystem: 'metric', hardnessUnit: 'ppm' };

describe('conversions', () => {
	it('converts temperature both ways', () => {
		expect(cToF(0)).toBe(32);
		expect(cToF(100)).toBe(212);
		expect(fToC(77)).toBeCloseTo(25);
		expect(cToF(fToC(74))).toBeCloseTo(74, 10);
	});

	it('converts volume both ways', () => {
		expect(galToL(1)).toBeCloseTo(3.7854, 4);
		expect(lToGal(galToL(40))).toBeCloseTo(40, 10);
	});

	it('uses 1 dGH = 17.848 ppm', () => {
		expect(PPM_PER_DGH).toBe(17.848);
		expect(dghToPpm(4)).toBeCloseTo(71.392);
	});
});

describe('toDisplay / toStored', () => {
	it('shows imperial temperature and volume', () => {
		expect(toDisplay(25, 'temp', imperialDgh)).toBeCloseTo(77);
		expect(toDisplay(galToL(40), 'volume', imperialDgh)).toBeCloseTo(40);
		expect(toDisplay(2.54, 'length', imperialDgh)).toBeCloseTo(1);
	});

	it('leaves metric values unchanged', () => {
		expect(toDisplay(25, 'temp', metricPpm)).toBe(25);
		expect(toDisplay(151.4, 'volume', metricPpm)).toBe(151.4);
		expect(toDisplay(91, 'length', metricPpm)).toBe(91);
	});

	it('treats hardness independently of the unit system', () => {
		expect(toDisplay(4, 'hardness', imperialDgh)).toBe(4);
		expect(toDisplay(4, 'hardness', metricPpm)).toBeCloseTo(71.392);
		expect(toDisplay(4, 'hardness', { unitSystem: 'imperial', hardnessUnit: 'ppm' })).toBeCloseTo(
			71.392
		);
	});

	it('never converts chemistry (ppm) or pH', () => {
		expect(toDisplay(35, 'none', imperialDgh)).toBe(35);
		expect(toStored(35, 'none', metricPpm)).toBe(35);
	});

	it('round-trips every quantity', () => {
		for (const q of ['volume', 'temp', 'length', 'hardness', 'none'] as const) {
			for (const prefs of [imperialDgh, metricPpm]) {
				expect(toStored(toDisplay(12.3, q, prefs), q, prefs)).toBeCloseTo(12.3, 10);
			}
		}
	});
});

describe('unitLabel', () => {
	it('labels each quantity', () => {
		expect(unitLabel('volume', imperialDgh)).toBe('gal');
		expect(unitLabel('volume', metricPpm)).toBe('L');
		expect(unitLabel('temp', imperialDgh)).toBe('°F');
		expect(unitLabel('temp', metricPpm)).toBe('°C');
		expect(unitLabel('length', imperialDgh)).toBe('in');
		expect(unitLabel('hardness', imperialDgh)).toBe('dGH');
		expect(unitLabel('hardness', imperialDgh, 'kh')).toBe('dKH');
		expect(unitLabel('hardness', metricPpm, 'kh')).toBe('ppm');
		expect(unitLabel('none', imperialDgh)).toBe('');
	});
});

describe('formatNumber', () => {
	it('rounds and trims trailing zeros', () => {
		expect(formatNumber(6.8)).toBe('6.8');
		expect(formatNumber(35.0, 0)).toBe('35');
		expect(formatNumber(76.99999, 0)).toBe('77');
		expect(formatNumber(0.25, 2)).toBe('0.25');
		expect(formatNumber(0.1, 2)).toBe('0.1');
		expect(formatNumber(-0.0001, 1)).toBe('0');
	});
});

describe('parseNumber', () => {
	it('parses user input', () => {
		expect(parseNumber('6.8')).toBe(6.8);
		expect(parseNumber(' 40 ')).toBe(40);
		expect(parseNumber('6,8')).toBe(6.8);
		expect(parseNumber('0')).toBe(0);
		expect(parseNumber(3)).toBe(3);
	});

	it('returns null for empty or invalid input', () => {
		expect(parseNumber('')).toBeNull();
		expect(parseNumber('   ')).toBeNull();
		expect(parseNumber('abc')).toBeNull();
		expect(parseNumber(null)).toBeNull();
		expect(parseNumber(undefined)).toBeNull();
	});
});

describe('dropsAsPpm (hardness typed in ppm that looks like drops)', () => {
	it('reads a small number as drops', () => {
		expect(dropsAsPpm(7)).toEqual({ drops: 7, ppm: 125, times10: false });
		expect(dropsAsPpm(1)).toEqual({ drops: 1, ppm: 18, times10: false });
		expect(dropsAsPpm(4.5)).toEqual({ drops: 4.5, ppm: 80, times10: false });
	});
	it('reads a round number as drops × 10', () => {
		expect(dropsAsPpm(80)).toEqual({ drops: 8, ppm: 143, times10: true });
		expect(dropsAsPpm(20)).toEqual({ drops: 2, ppm: 36, times10: true });
	});
	it('leaves what looks like ppm alone', () => {
		for (const v of [null, 0, 0.5, 7.3, 54, 143, 161, 400]) expect(dropsAsPpm(v), String(v)).toBeNull();
	});
});
