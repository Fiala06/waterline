// Numbers from the calculators in the keeper's units (shared by the page and the server).
import { formatNumber, toDisplay, unitLabel, type UnitPrefs } from './units';

/** "168 L" or "44.4 gal". */
export const fmtVolume = (litres: number, prefs: UnitPrefs, decimals = 1) => `${formatNumber(toDisplay(litres, 'volume', prefs), decimals)} ${unitLabel('volume', prefs)}`;

/** Grams, or ounces for imperial keepers who weigh salts that way too ("12.5 g · 0.44 oz"). */
export const fmtGrams = (g: number) => (g >= 1000 ? `${formatNumber(g / 1000, 2)} kg` : `${formatNumber(g, g < 10 ? 2 : 1)} g`);

/** Kilograms with pounds beside them for imperial keepers. */
export const fmtWeight = (kg: number, prefs: UnitPrefs) => (prefs.unitSystem === 'imperial' ? `${formatNumber(kg * 2.20462, 1)} lb` : `${formatNumber(kg, 1)} kg`);
