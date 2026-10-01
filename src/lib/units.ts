// Values are stored metric (L, °C, cm) with hardness in dGH, and converted at
// the edge for display and input.

export type UnitSystem = 'imperial' | 'metric';
export type HardnessUnit = 'dgh' | 'ppm';
export interface UnitPrefs {
	unitSystem: UnitSystem;
	hardnessUnit: HardnessUnit;
}

/** Which conversion a stored quantity needs. `none` = shown as stored. */
export type Quantity = 'volume' | 'temp' | 'length' | 'hardness' | 'none';

export const PPM_PER_DGH = 17.848;
const L_PER_GAL = 3.785411784;
const CM_PER_IN = 2.54;

export const lToGal = (l: number) => l / L_PER_GAL;
export const galToL = (gal: number) => gal * L_PER_GAL;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const dghToPpm = (dgh: number) => dgh * PPM_PER_DGH;
export const ppmToDgh = (ppm: number) => ppm / PPM_PER_DGH;

/**
 * A GH or KH typed in ppm that looks like a drop count instead: a small number
 * (7 is 7 drops, not 7 ppm) or a round one (80 is 8 drops × 10). The ppm those
 * drops are, whole, for the form to offer; null when it looks like ppm.
 */
export function dropsAsPpm(v: number | null): { drops: number; ppm: number; times10: boolean } | null {
	if (v == null || !Number.isFinite(v)) return null;
	if (v >= 1 && v < 20 && Number.isInteger(v * 2)) return { drops: v, ppm: Math.round(dghToPpm(v)), times10: false };
	if (v >= 20 && v <= 300 && v % 10 === 0) return { drops: v / 10, ppm: Math.round(dghToPpm(v / 10)), times10: true };
	return null;
}

/** Stored (metric/dGH) value → the user's display unit. */
export function toDisplay(value: number, q: Quantity, prefs: UnitPrefs): number {
	const imperial = prefs.unitSystem === 'imperial';
	switch (q) {
		case 'volume':
			return imperial ? lToGal(value) : value;
		case 'temp':
			return imperial ? cToF(value) : value;
		case 'length':
			return imperial ? cmToIn(value) : value;
		case 'hardness':
			return prefs.hardnessUnit === 'ppm' ? dghToPpm(value) : value;
		default:
			return value;
	}
}

/** Value entered in the user's display unit → stored (metric/dGH) value. */
export function toStored(value: number, q: Quantity, prefs: UnitPrefs): number {
	const imperial = prefs.unitSystem === 'imperial';
	switch (q) {
		case 'volume':
			return imperial ? galToL(value) : value;
		case 'temp':
			return imperial ? fToC(value) : value;
		case 'length':
			return imperial ? inToCm(value) : value;
		case 'hardness':
			return prefs.hardnessUnit === 'ppm' ? ppmToDgh(value) : value;
		default:
			return value;
	}
}

/**
 * Unit label for a quantity. Hardness needs to know whether it is general (GH)
 * or carbonate (KH) hardness, because dGH and dKH are labelled differently.
 */
export function unitLabel(q: Quantity, prefs: UnitPrefs, hardness: 'gh' | 'kh' = 'gh'): string {
	const imperial = prefs.unitSystem === 'imperial';
	switch (q) {
		case 'volume':
			return imperial ? 'gal' : 'L';
		case 'temp':
			return imperial ? '°F' : '°C';
		case 'length':
			return imperial ? 'in' : 'cm';
		case 'hardness':
			return prefs.hardnessUnit === 'ppm' ? 'ppm' : hardness === 'kh' ? 'dKH' : 'dGH';
		default:
			return '';
	}
}

/**
 * Round for display and drop trailing zeros: 6.80 → "6.8", 35.0 → "35".
 * Negative zero is shown as "0".
 */
export function formatNumber(value: number, decimals = 1): string {
	const f = 10 ** decimals;
	const r = Math.round(value * f) / f;
	return String(Object.is(r, -0) ? 0 : r);
}

/** Parse user input like "6,8" or " 40 " into a number; null if empty/invalid. */
export function parseNumber(input: unknown): number | null {
	if (typeof input !== 'string' && typeof input !== 'number') return null;
	const s = String(input).trim().replace(',', '.');
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}
