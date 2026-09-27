import { describe, expect, it } from 'vitest';
import { compactName, defaultParameters, fmtDisplayValue, fmtRange, type ParamLike } from './params';
import { TANK_TYPES } from './types';
import type { UnitPrefs } from './units';

const imperial: UnitPrefs = { unitSystem: 'imperial', hardnessUnit: 'dgh' };
const metricPpm: UnitPrefs = { unitSystem: 'metric', hardnessUnit: 'ppm' };
const keys = (t: (typeof TANK_TYPES)[number]) => defaultParameters(imperial, t).map((p) => p.key);

describe('defaultParameters presets', () => {
	it('gives every type the nitrogen cycle basics and temperature', () => {
		for (const t of TANK_TYPES) expect(keys(t)).toEqual(expect.arrayContaining(['nh3', 'no2', 'no3', 'ph', 'temp']));
	});

	it('adds nutrients and CO₂ for planted tanks', () => {
		expect(keys('planted')).toEqual(expect.arrayContaining(['po4', 'k', 'fe', 'co2', 'gh', 'kh']));
		expect(keys('freshwater')).not.toContain('co2');
	});

	it('adds salinity for brackish and reef', () => {
		expect(keys('brackish')).toContain('sal');
		expect(keys('reef')).toEqual(expect.arrayContaining(['sal', 'kh', 'ca', 'mg', 'po4']));
		expect(keys('reef')).not.toContain('gh');
	});

	it('names KH "Alkalinity" on reef tanks', () => {
		expect(defaultParameters(imperial, 'reef').find((p) => p.key === 'kh')?.name).toBe('Alkalinity');
	});

	it('shows round targets in the user’s own units', () => {
		const range = (prefs: UnitPrefs, t: (typeof TANK_TYPES)[number], key: string) =>
			fmtRange(defaultParameters(prefs, t).find((p) => p.key === key)!, prefs);
		expect(range(imperial, 'freshwater', 'temp')).toBe('74–80 °F');
		expect(range(metricPpm, 'freshwater', 'temp')).toBe('23–27 °C');
		expect(range(metricPpm, 'freshwater', 'gh')).toBe('70–140 ppm');
		expect(range(imperial, 'reef', 'kh')).toBe('7–11 dKH');
		expect(range(imperial, 'reef', 'sal')).toBe('33–35 ppt');
		expect(range(imperial, 'freshwater', 'nh3')).toBe('≤ 0.25 ppm');
	});

	it('numbers presets in order with no duplicate keys', () => {
		for (const t of TANK_TYPES) {
			const ps = defaultParameters(imperial, t);
			expect(new Set(ps.map((p) => p.key)).size).toBe(ps.length);
			expect(ps.map((p) => p.sort)).toEqual(ps.map((_, i) => i));
		}
	});
});

describe('compactName', () => {
	it("gives every preset's parameters a name short enough for the desktop cards", () => {
		const us = { unitSystem: 'imperial', hardnessUnit: 'dgh' } as const;
		for (const type of TANK_TYPES) {
			for (const p of defaultParameters(us, type)) expect(compactName(p).length, `${type} ${p.name}`).toBeLessThanOrEqual(4);
		}
		const names = defaultParameters(us, 'planted').map(compactName);
		expect(names).toEqual(['pH', 'NH₃', 'NO₂', 'NO₃', 'PO₄', 'K', 'Fe', 'CO₂', 'GH', 'KH', 'Temp']);
		expect(defaultParameters(us, 'reef').map(compactName)).toEqual(['Sal', 'Alk', 'Ca', 'Mg', 'PO₄', 'NO₃', 'NH₃', 'NO₂', 'pH', 'Temp']);
	});

	it("keeps a custom parameter's own name", () => {
		expect(compactName({ key: 'custom', name: 'Silicate', unit: 'ppm', decimals: 1, min: null, max: null })).toBe('Silicate');
	});
});

describe('fmtDisplayValue', () => {
	const param = (key: string, over: Partial<ParamLike> = {}): ParamLike => ({ key, name: key, unit: '', decimals: 1, min: null, max: null, ...over });

	it('shows a chart value as the rest of the app shows it', () => {
		// 25.3 °C is 77.54 °F; °F are whole numbers
		expect(fmtDisplayValue(param('temp'), 77.54, imperial)).toBe('78');
		expect(fmtDisplayValue(param('nitrate', { unit: 'ppm', decimals: 0 }), 14.2, imperial)).toBe('14');
	});

	it('keeps the decimal that decides the status', () => {
		expect(fmtDisplayValue(param('ph', { min: 6.5, max: 7.5 }), 7.54, imperial)).toBe('7.54');
	});
});
