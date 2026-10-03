// Calculators (#18): the arithmetic behind the Calculators page, all metric
// (L, cm, °C, dKH/dGH, ppm as mg/L). The page converts to and from the
// keeper's units at the edge with src/lib/units.ts.

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// ── Tank volume ─────────────────────────────────────────────────────────────

export interface VolumeInput {
	lengthCm: number;
	widthCm: number;
	heightCm: number;
	/** glass thickness, taken off every side (0 for the inside measurements) */
	glassCm?: number;
	/** how deep the substrate is, taken off the height */
	substrateCm?: number;
	/** how far the water sits below the rim, taken off the height */
	gapCm?: number;
}

/** Litres a box holds (gross), and what's left for water after glass, substrate and the air gap. */
export function tankVolume(i: VolumeInput): { grossL: number; waterL: number } | null {
	if (!(i.lengthCm > 0 && i.widthCm > 0 && i.heightCm > 0)) return null;
	const g = Math.max(0, i.glassCm ?? 0);
	const inner = { l: i.lengthCm - 2 * g, w: i.widthCm - 2 * g, h: i.heightCm - g };
	if (inner.l <= 0 || inner.w <= 0 || inner.h <= 0) return null;
	const grossL = (inner.l * inner.w * inner.h) / 1000;
	const h = inner.h - Math.max(0, i.substrateCm ?? 0) - Math.max(0, i.gapCm ?? 0);
	return { grossL: round(grossL, 1), waterL: round(Math.max(0, (inner.l * inner.w * h) / 1000), 1) };
}

// ── Water change ────────────────────────────────────────────────────────────

/**
 * The share of the water to change to bring a reading from `from` to `to`,
 * when the new water reads `fresh` (0 for nitrate from the tap, or the tap's
 * own reading). null when it can't be reached that way (the target is below
 * what the new water brings, or already met).
 */
export function waterChangeFraction(from: number, to: number, fresh = 0): number | null {
	if (!(from > fresh) || to >= from) return null;
	if (to < fresh) return null;
	const f = (from - to) / (from - fresh);
	return f > 1 ? null : f;
}

/** What a reading becomes after changing `fraction` of the water with water reading `fresh`. */
export function afterWaterChange(from: number, fraction: number, fresh = 0): number {
	const f = Math.min(1, Math.max(0, fraction));
	return from - (from - fresh) * f;
}

// ── Dose → ppm ──────────────────────────────────────────────────────────────

/**
 * A product's strength in mg per mL of what it adds, from how a bottle states
 * it: "`doseMl` mL in `perL` litres adds `ppm` ppm".
 */
export function strengthMgPerMl(doseMl: number, perL: number, ppm: number): number | null {
	if (!(doseMl > 0 && perL > 0 && ppm >= 0)) return null;
	return (ppm * perL) / doseMl;
}

/** The ppm (mg/L) a dose adds to a volume. */
export function ppmFromDose(doseMl: number, mgPerMl: number, volumeL: number): number | null {
	if (!(doseMl >= 0 && mgPerMl > 0 && volumeL > 0)) return null;
	return (doseMl * mgPerMl) / volumeL;
}

/** The dose (mL) that adds `ppm` to a volume. */
export function doseForPpm(ppm: number, mgPerMl: number, volumeL: number): number | null {
	if (!(ppm >= 0 && mgPerMl > 0 && volumeL > 0)) return null;
	return (ppm * volumeL) / mgPerMl;
}

// ── Heater size ─────────────────────────────────────────────────────────────

/** About 0.16 W per litre for each °C the water is kept above the room (5 W per gallon lifts it some 8 °C). */
export const WATTS_PER_L_PER_C = 0.16;
export const HEATER_SIZES = [25, 50, 75, 100, 150, 200, 250, 300];

/**
 * The heater a tank needs to hold `targetC` in a room at `roomC`: the watts
 * worked out, the common size to buy (two heaters above 300 W, which also
 * keeps the tank safe when one sticks), and the rule of thumb per litre.
 */
export function heaterSize(volumeL: number, roomC: number, targetC: number): { watts: number; buy: string; perL: number } | null {
	if (!(volumeL > 0) || !Number.isFinite(roomC) || !Number.isFinite(targetC)) return null;
	const delta = Math.max(0, targetC - roomC);
	const watts = Math.ceil(volumeL * delta * WATTS_PER_L_PER_C);
	let buy: string;
	if (watts === 0) buy = 'No heater needed';
	else {
		const one = HEATER_SIZES.find((s) => s >= watts);
		if (one) buy = `${one} W`;
		else {
			const each = HEATER_SIZES.find((s) => s * 2 >= watts) ?? 300;
			buy = `2 × ${each} W`;
		}
	}
	return { watts, buy, perL: round(watts / volumeL, 2) };
}

// ── Substrate ───────────────────────────────────────────────────────────────

/** Kilograms a litre of each substrate weighs, as bagged. */
export const SUBSTRATE_DENSITY: Record<string, { label: string; kgPerL: number }> = {
	gravel: { label: 'Gravel', kgPerL: 1.6 },
	sand: { label: 'Sand', kgPerL: 1.5 },
	aquasoil: { label: 'Aqua soil', kgPerL: 0.75 }
};

/**
 * Substrate for a footprint: `frontCm` deep at the front and `backCm` at the
 * back (the same for a flat bed), as litres and kilograms of the kind picked.
 */
export function substrateAmount(lengthCm: number, widthCm: number, frontCm: number, backCm: number, kind: keyof typeof SUBSTRATE_DENSITY | string): { litres: number; kg: number } | null {
	if (!(lengthCm > 0 && widthCm > 0) || !(frontCm >= 0 && backCm >= 0) || frontCm + backCm === 0) return null;
	const litres = (lengthCm * widthCm * ((frontCm + backCm) / 2)) / 1000;
	const density = SUBSTRATE_DENSITY[kind]?.kgPerL ?? SUBSTRATE_DENSITY.gravel.kgPerL;
	return { litres: round(litres, 1), kg: round(litres * density, 1) };
}

// ── CO₂ from pH and KH ──────────────────────────────────────────────────────

/** Dissolved CO₂ (ppm) from the pH / KH relationship: 3 × KH × 10^(7 − pH). */
export function co2Ppm(ph: number, dkh: number): number | null {
	if (!(dkh > 0) || !(ph > 0 && ph < 14)) return null;
	return round(3 * dkh * 10 ** (7 - ph), 1);
}

/** The pH to aim for to hold `targetPpm` of CO₂ at this KH (30 ppm is the usual planted target). */
export function phForCo2(targetPpm: number, dkh: number): number | null {
	if (!(dkh > 0 && targetPpm > 0)) return null;
	return round(7 - Math.log10(targetPpm / (3 * dkh)), 2);
}

/** How the CO₂ reads for a planted tank, as icon + word, never color alone. */
export function co2Status(ppm: number): { level: 'low' | 'ok' | 'high'; text: string } {
	if (ppm < 15) return { level: 'low', text: '▲ Low · plants want 20–30 ppm' };
	if (ppm > 35) return { level: 'high', text: '✕ High · fish gasp above about 35 ppm' };
	return { level: 'ok', text: '✓ In range · 15–35 ppm' };
}

// ── GH / KH remineralization ────────────────────────────────────────────────

// 1 degree = 17.86 mg/L as CaCO₃ = 0.3572 meq/L.
const MEQ_PER_DEGREE = 0.35715;
const NAHCO3_MG_PER_MEQ = 84.007; // sodium bicarbonate, one equivalent per mole
const KHCO3_MG_PER_MEQ = 100.115; // potassium bicarbonate
const CASO4_2H2O_MG_PER_MEQ = 172.17 / 2; // gypsum
const MGSO4_7H2O_MG_PER_MEQ = 246.47 / 2; // Epsom salt
/** Calcium to magnesium, by equivalents, for general hardness: the usual 3 : 1. */
const CA_SHARE = 0.75;

export interface Remineralize {
	/** grams of each salt for the whole volume */
	bakingSodaG: number;
	potassiumBicarbonateG: number;
	gypsumG: number;
	epsomSaltG: number;
}

/**
 * Salts to raise `volumeL` of RO/DI water (or any water) by `dkh` degrees of
 * carbonate hardness and `dgh` of general hardness: baking soda (or potassium
 * bicarbonate instead) for KH; gypsum and Epsom salt, 3 : 1 calcium to
 * magnesium, for GH. Either rise can be 0.
 */
export function remineralize(volumeL: number, dkh: number, dgh: number): Remineralize | null {
	if (!(volumeL > 0) || !(dkh >= 0 && dgh >= 0) || dkh + dgh === 0) return null;
	const khMeq = dkh * MEQ_PER_DEGREE * volumeL;
	const ghMeq = dgh * MEQ_PER_DEGREE * volumeL;
	return {
		bakingSodaG: round((khMeq * NAHCO3_MG_PER_MEQ) / 1000, 2),
		potassiumBicarbonateG: round((khMeq * KHCO3_MG_PER_MEQ) / 1000, 2),
		gypsumG: round((ghMeq * CA_SHARE * CASO4_2H2O_MG_PER_MEQ) / 1000, 2),
		epsomSaltG: round((ghMeq * (1 - CA_SHARE) * MGSO4_7H2O_MG_PER_MEQ) / 1000, 2)
	};
}
