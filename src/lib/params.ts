import { paramStatus, rangeText, type Range, type Status } from './status';
import {
	formatNumber,
	fToC,
	ppmToDgh,
	toDisplay,
	toStored,
	unitLabel,
	type Quantity,
	type UnitPrefs
} from './units';

/** Minimal shape of a tank_parameters row that display logic needs. */
export interface ParamLike {
	key: string;
	name: string;
	unit: string;
	decimals: number;
	min: number | null;
	max: number | null;
}

export const BUILTIN_KEYS = ['ph', 'nh3', 'no2', 'no3', 'gh', 'kh', 'temp'] as const;

export function quantityOf(key: string): Quantity {
	if (key === 'gh' || key === 'kh') return 'hardness';
	if (key === 'temp') return 'temp';
	return 'none';
}

/** Unit label shown to this user. Custom parameters keep the unit they were given. */
export function paramUnit(p: ParamLike, prefs: UnitPrefs): string {
	const q = quantityOf(p.key);
	if (q === 'none') return p.unit;
	return unitLabel(q, prefs, p.key === 'kh' ? 'kh' : 'gh');
}

/** Decimals for display; hardness in ppm is always whole numbers. */
export function paramDecimals(p: ParamLike, prefs: UnitPrefs): number {
	if (quantityOf(p.key) === 'hardness' && prefs.hardnessUnit === 'ppm') return 0;
	return p.decimals;
}

export function displayValue(p: ParamLike, stored: number, prefs: UnitPrefs): number {
	return toDisplay(stored, quantityOf(p.key), prefs);
}

export function storedValue(p: ParamLike, display: number, prefs: UnitPrefs): number {
	return toStored(display, quantityOf(p.key), prefs);
}

/** Formatted value in display units, e.g. "6.8" or "77". */
export function fmtValue(p: ParamLike, stored: number, prefs: UnitPrefs): string {
	return formatNumber(displayValue(p, stored, prefs), paramDecimals(p, prefs));
}

/** Target range text in display units, e.g. "5–20 ppm" or "≤ 0.25 ppm". */
export function fmtRange(p: ParamLike, prefs: UnitPrefs, withUnit = true): string {
	const f = (v: number | null) => (v == null ? null : fmtValue(p, v, prefs));
	return rangeText(f(p.min), f(p.max), withUnit ? paramUnit(p, prefs) : '', p.min === 0);
}

export function statusOf(p: ParamLike, stored: number | null | undefined): Status {
	return paramStatus(stored, { min: p.min, max: p.max } satisfies Range);
}

/** Default parameter set, with targets chosen in the user's own units so they read as round numbers. */
export function defaultParameters(prefs: UnitPrefs) {
	const imperial = prefs.unitSystem === 'imperial';
	const ppm = prefs.hardnessUnit === 'ppm';
	const hard = (dgh: number, ppmValue: number) => (ppm ? ppmToDgh(ppmValue) : dgh);
	return [
		{ key: 'ph', name: 'pH', unit: '', decimals: 1, min: 6.5, max: 7.5 },
		{ key: 'nh3', name: 'Ammonia', unit: 'ppm', decimals: 2, min: 0, max: 0.25 },
		{ key: 'no2', name: 'Nitrite', unit: 'ppm', decimals: 2, min: 0, max: 0.25 },
		{ key: 'no3', name: 'Nitrate', unit: 'ppm', decimals: 0, min: 5, max: 20 },
		{ key: 'gh', name: 'GH', unit: 'dGH', decimals: 0, min: hard(4, 70), max: hard(8, 140) },
		{ key: 'kh', name: 'KH', unit: 'dKH', decimals: 0, min: hard(2, 35), max: hard(5, 90) },
		{
			key: 'temp',
			name: 'Temperature',
			unit: '°C',
			decimals: imperial ? 0 : 1,
			min: imperial ? fToC(74) : 23,
			max: imperial ? fToC(80) : 27
		}
	].map((p, i) => ({ ...p, sort: i, tracked: true, isCustom: false }));
}

/** Short name used on dashboard cards (design uses "Temp"). */
export function shortName(p: ParamLike): string {
	return p.key === 'temp' ? 'Temp' : p.name;
}
