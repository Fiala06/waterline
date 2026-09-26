import { describe, expect, it } from 'vitest';
import { defaultParameters, fmtRange } from './params';
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
