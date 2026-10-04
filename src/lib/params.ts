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
import type { TankType } from './types';

/** Minimal shape of a tank_parameters row that display logic needs. */
export interface ParamLike {
	key: string;
	name: string;
	unit: string;
	decimals: number;
	min: number | null;
	max: number | null;
}

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

/**
 * Decimals for display: hardness in ppm and °F are whole numbers, °C has
 * one, and degrees of hardness up to one (8 dGH, or 8.4 from a ppm reading).
 */
export function paramDecimals(p: ParamLike, prefs: UnitPrefs): number {
	const q = quantityOf(p.key);
	if (q === 'hardness') return prefs.hardnessUnit === 'ppm' ? 0 : Math.max(1, p.decimals);
	if (q === 'temp') return prefs.unitSystem === 'imperial' ? 0 : 1;
	return p.decimals;
}

export function displayValue(p: ParamLike, stored: number, prefs: UnitPrefs): number {
	return toDisplay(stored, quantityOf(p.key), prefs);
}

export function storedValue(p: ParamLike, display: number, prefs: UnitPrefs): number {
	return toStored(display, quantityOf(p.key), prefs);
}

/**
 * A reading in display units, e.g. "6.8" or "77". Rounding never changes what
 * the status says: pH 7.54 against a max of 7.5 shows "7.54", not "7.5".
 */
export function fmtValue(p: ParamLike, stored: number, prefs: UnitPrefs): string {
	const v = displayValue(p, stored, prefs);
	const level = statusOf(p, stored).level;
	const base = paramDecimals(p, prefs);
	let out = formatNumber(v, base);
	for (let d = base + 1; d <= base + 2 && statusOf(p, storedValue(p, Number(out), prefs)).level !== level; d++) {
		out = formatNumber(v, d);
	}
	return out;
}

/**
 * A target limit in display units, with one more decimal when the usual
 * rounding would move it: 4 dGH is "71.4" ppm, not "71".
 */
export function fmtTarget(p: ParamLike, stored: number, prefs: UnitPrefs): string {
	const v = displayValue(p, stored, prefs);
	const base = paramDecimals(p, prefs);
	const out = formatNumber(v, base);
	return Math.abs(Number(out) - v) < 1e-6 ? out : formatNumber(v, base + 1);
}

/** Target range text in display units, e.g. "5–20 ppm" or "≤ 0.25 ppm". */
export function fmtRange(p: ParamLike, prefs: UnitPrefs, withUnit = true): string {
	const f = (v: number | null) => (v == null ? null : fmtTarget(p, v, prefs));
	return rangeText(f(p.min), f(p.max), withUnit ? paramUnit(p, prefs) : '', p.min === 0);
}

export function statusOf(p: ParamLike, stored: number | null | undefined): Status {
	return paramStatus(stored, { min: p.min, max: p.max } satisfies Range);
}

/**
 * What a beginner's kit or test strip covers (#65): the water test form shows
 * these first, with the tank's custom parameters and anything tested before;
 * the rest fold under "Show N more". A reef keeps them all in view.
 */
const BASIC_TEST_KEYS = ['ph', 'nh3', 'no2', 'no3', 'gh', 'kh', 'temp', 'sal'];
export function foldsInTestForm(p: { key: string; isCustom?: boolean | null }, tankType: string, testedBefore: boolean): boolean {
	return tankType !== 'reef' && !p.isCustom && !testedBefore && !BASIC_TEST_KEYS.includes(p.key);
}

/**
 * Default parameter set for a tank type. Targets are chosen in the user's own
 * units so they read as round numbers (74–80 °F, not 73.4–80.6 °F).
 * Ranges are common hobby guidance; every one can be edited per tank.
 */
export function defaultParameters(prefs: UnitPrefs, type: TankType = 'freshwater') {
	const imperial = prefs.unitSystem === 'imperial';
	const ppm = prefs.hardnessUnit === 'ppm';
	const hard = (dgh: [number, number], ppmRange: [number, number]) =>
		ppm ? ppmRange.map(ppmToDgh) : dgh;
	const temp = (f: [number, number], c: [number, number]) => ({
		key: 'temp',
		name: 'Temperature',
		unit: '°C',
		decimals: imperial ? 0 : 1,
		min: imperial ? fToC(f[0]) : c[0],
		max: imperial ? fToC(f[1]) : c[1]
	});
	const p = (key: string, name: string, unit: string, decimals: number, [min, max]: number[]) => ({
		key,
		name,
		unit,
		decimals,
		min,
		max
	});

	const ammonia = p('nh3', 'Ammonia', 'ppm', 2, [0, 0.25]);
	const nitrite = p('no2', 'Nitrite', 'ppm', 2, [0, 0.25]);
	// shrimp keepers and RODI remineralisers test TDS (and conductivity) daily
	const tds = p('tds', 'TDS', 'ppm', 0, [100, 250]);
	const ec = p('ec', 'Conductivity', 'µS/cm', 0, [150, 450]);

	const sets: Record<TankType, ReturnType<typeof p>[]> = {
		freshwater: [
			p('ph', 'pH', '', 1, [6.0, 7.8]),
			ammonia,
			nitrite,
			p('no3', 'Nitrate', 'ppm', 0, [5, 20]),
			p('gh', 'GH', 'dGH', 0, hard([4, 8], [70, 140])),
			p('kh', 'KH', 'dKH', 0, hard([2, 5], [35, 90])),
			tds,
			ec,
			temp([74, 80], [23, 27])
		],
		planted: [
			p('ph', 'pH', '', 1, [6.0, 7.8]),
			ammonia,
			nitrite,
			p('no3', 'Nitrate', 'ppm', 0, [5, 20]),
			p('po4', 'Phosphate', 'ppm', 1, [0.5, 2]),
			p('k', 'Potassium', 'ppm', 0, [5, 20]),
			p('fe', 'Iron', 'ppm', 2, [0.05, 0.2]),
			p('co2', 'CO₂', 'ppm', 0, [20, 30]),
			p('gh', 'GH', 'dGH', 0, hard([4, 8], [70, 140])),
			p('kh', 'KH', 'dKH', 0, hard([2, 5], [35, 90])),
			tds,
			ec,
			temp([74, 80], [23, 27])
		],
		brackish: [
			p('ph', 'pH', '', 1, [7.5, 8.4]),
			ammonia,
			nitrite,
			p('no3', 'Nitrate', 'ppm', 0, [5, 20]),
			p('sal', 'Salinity', 'ppt', 0, [5, 15]),
			p('gh', 'GH', 'dGH', 0, hard([12, 20], [210, 360])),
			p('kh', 'KH', 'dKH', 0, hard([10, 18], [180, 320])),
			p('tds', 'TDS', 'ppm', 0, [3000, 12000]),
			p('ec', 'Conductivity', 'µS/cm', 0, [5000, 20000]),
			temp([75, 80], [24, 27])
		],
		reef: [
			p('sal', 'Salinity', 'ppt', 1, [33, 35]),
			p('kh', 'Alkalinity', 'dKH', 1, hard([7, 11], [125, 200])),
			p('ca', 'Calcium', 'ppm', 0, [400, 450]),
			p('mg', 'Magnesium', 'ppm', 0, [1250, 1400]),
			p('po4', 'Phosphate', 'ppm', 2, [0.03, 0.1]),
			p('no3', 'Nitrate', 'ppm', 0, [2, 10]),
			ammonia,
			nitrite,
			p('ph', 'pH', '', 1, [7.9, 8.4]),
			p('orp', 'ORP', 'mV', 0, [300, 450]),
			temp([76, 79], [24.5, 26])
		]
	};
	return [...sets[type]].map((x, i) => ({ ...x, sort: i, tracked: true, isCustom: false }));
}

/** Short name used on dashboard cards (design uses "Temp"). */
export function shortName(p: ParamLike): string {
	return p.key === 'temp' ? 'Temp' : p.name;
}

const COMPACT_NAMES: Record<string, string> = {
	nh3: 'NH₃',
	no2: 'NO₂',
	no3: 'NO₃',
	po4: 'PO₄',
	k: 'K',
	fe: 'Fe',
	ca: 'Ca',
	mg: 'Mg',
	sal: 'Sal',
	tds: 'TDS',
	ec: 'EC',
	orp: 'ORP',
	temp: 'Temp'
};

/**
 * The name on the desktop dashboard's seven-across cards (design 1a): the
 * formula or a short form, so every card's name fits. The full name is on hover.
 */
export function compactName(p: ParamLike): string {
	if (p.key === 'kh') return /^alk/i.test(p.name) ? 'Alk' : p.name;
	return COMPACT_NAMES[p.key] ?? p.name;
}
