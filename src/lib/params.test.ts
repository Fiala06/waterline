import { describe, expect, it } from 'vitest';
import { compactName, defaultParameters, fmtRange, fmtValue, statusOf, storedValue } from './params';
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

	it('adds TDS and conductivity after GH/KH for freshwater, planted and brackish', () => {
		for (const t of ['freshwater', 'planted', 'brackish'] as const) {
			const k = keys(t);
			expect(k.indexOf('tds')).toBe(k.indexOf('kh') + 1);
			expect(k.indexOf('ec')).toBe(k.indexOf('tds') + 1);
		}
		expect(keys('reef')).not.toContain('tds');
		const tds = defaultParameters(imperial, 'planted').find((p) => p.key === 'tds')!;
		expect([tds.unit, tds.decimals, tds.min, tds.max]).toEqual(['ppm', 0, 100, 250]);
		expect(fmtRange(defaultParameters(imperial, 'freshwater').find((p) => p.key === 'ec')!, imperial)).toBe('150–450 µS/cm');
	});

	it('adds ORP and keeps temperature on reef tanks', () => {
		const k = keys('reef');
		expect(k).toEqual(expect.arrayContaining(['orp', 'temp']));
		expect(k.indexOf('orp')).toBe(k.indexOf('ph') + 1);
		expect(fmtRange(defaultParameters(imperial, 'reef').find((p) => p.key === 'orp')!, imperial)).toBe('300–450 mV');
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
		expect(names).toEqual(['pH', 'NH₃', 'NO₂', 'NO₃', 'PO₄', 'K', 'Fe', 'CO₂', 'GH', 'KH', 'TDS', 'EC', 'Temp']);
		expect(defaultParameters(us, 'reef').map(compactName)).toEqual(['Sal', 'Alk', 'Ca', 'Mg', 'PO₄', 'NO₃', 'NH₃', 'NO₂', 'pH', 'ORP', 'Temp']);
	});

	it("keeps a custom parameter's own name", () => {
		expect(compactName({ key: 'custom', name: 'Silicate', unit: 'ppm', decimals: 1, min: null, max: null })).toBe('Silicate');
	});
});

describe('hardness in degrees or ppm', () => {
	const gh = { key: 'gh', name: 'GH', unit: 'dGH', decimals: 0, min: 4, max: 10 };
	const deg: UnitPrefs = { unitSystem: 'metric', hardnessUnit: 'dgh' };
	const ppm: UnitPrefs = { unitSystem: 'metric', hardnessUnit: 'ppm' };

	it('8 drops is 8 dGH, about 143 ppm, whichever way it was typed', () => {
		const typedDeg = storedValue(gh, 8, deg);
		const typedPpm = storedValue(gh, 143, ppm);
		expect(fmtValue(gh, typedDeg, deg)).toBe('8');
		expect(fmtValue(gh, typedDeg, ppm)).toBe('143');
		expect(fmtValue(gh, typedPpm, deg)).toBe('8');
	});

	it('shows degrees to a tenth and ppm whole', () => {
		const s = storedValue(gh, 150, ppm);
		expect(fmtValue(gh, s, deg)).toBe('8.4');
		expect(fmtValue(gh, s, ppm)).toBe('150');
		expect(fmtRange(gh, deg)).toBe('4–10 dGH');
		expect(fmtRange(gh, ppm)).toBe('71.4–178.5 ppm');
	});

	it('a status is the same in either unit: it is worked out on the stored value', () => {
		for (const v of [3, 4, 4.3, 8, 10, 10.2, 11]) {
			const fromDeg = storedValue(gh, v, deg);
			const fromPpm = storedValue(gh, Number(fmtValue(gh, fromDeg, ppm)), ppm);
			expect(statusOf(gh, fromPpm).level, `${v} dGH`).toBe(statusOf(gh, fromDeg).level);
		}
	});
});
