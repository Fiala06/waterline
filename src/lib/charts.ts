// Time ranges on the Charts screen: the short label for the picker on phones, the long one on desktop.
export const CHART_RANGES = [
	{ key: '2w', label: '2W', long: '2 weeks', days: 14 },
	{ key: '1m', label: '1M', long: '30 days', days: 30 },
	{ key: '3m', label: '3M', long: '90 days', days: 91 },
	{ key: '1y', label: '1Y', long: '1 year', days: 365 },
	{ key: 'all', label: 'All', long: 'All', days: 0 }
] as const;

/**
 * The range a parameter's chart draws (#74): the readings, and room past the
 * target on both sides, so the target is a band and never the whole chart.
 * - min 0 (ammonia, nitrite): from 0 up to twice the limit, or past the highest reading
 * - min and max: about half the target's width above and below, down to 0 at most
 * - only one limit: half of it again past it
 * - no target: the readings with a little padding
 * Readings below 0 (a sensor offset) stay in view.
 */
export function chartDomain(values: number[], band: { min: number | null; max: number | null }): { lo: number; hi: number } {
	const vals = values.filter((v) => Number.isFinite(v));
	const vLo = vals.length ? Math.min(...vals) : null;
	const vHi = vals.length ? Math.max(...vals) : null;
	const { min, max } = band;
	let lo: number;
	let hi: number;
	if (min === 0 && max != null && max > 0) {
		lo = 0;
		hi = Math.max(max * 2, (vHi ?? 0) * 1.1);
	} else if (min != null && max != null && max > min) {
		const span = max - min;
		lo = Math.min(min - span * 0.45, vLo != null ? vLo - span * 0.1 : Infinity);
		hi = Math.max(max + span * 0.45, vHi != null ? vHi + span * 0.1 : -Infinity);
	} else if (max != null && max > 0) {
		lo = Math.min(0, vLo ?? 0);
		hi = Math.max(max * 1.5, (vHi ?? 0) * 1.1);
	} else if (min != null && min > 0) {
		lo = Math.min(min * 0.5, vLo != null ? vLo - min * 0.1 : Infinity);
		hi = Math.max(min * 1.5, vHi != null ? vHi + min * 0.1 : -Infinity);
	} else {
		if (vLo == null || vHi == null) return { lo: 0, hi: 1 };
		const pad = vHi > vLo ? (vHi - vLo) * 0.12 : Math.max(1, Math.abs(vHi) * 0.1);
		lo = vLo - pad;
		hi = vHi + pad;
	}
	// nothing below 0 unless a reading is
	if (lo < 0 && (vLo == null || vLo >= 0)) lo = 0;
	if (vLo != null && vLo < lo) lo = vLo;
	if (!(hi > lo)) hi = lo + 1;
	return { lo, hi };
}

/** Where the shared target band sits on the all-parameters chart, from the bottom (0) to the top (1). */
export const TARGET_BAND = { lo: 0.3, hi: 0.7 } as const;

/**
 * A reading's height on the all-parameters chart, 0 (bottom) to 1 (top): pH,
 * nitrate and temperature have nothing in common but their targets, so each is
 * drawn against its own. The target fills TARGET_BAND, evenly; past it the
 * distance shrinks toward the edge (one target-width past the limit is halfway
 * there), so nothing is cut off and High is always above, Low always below.
 * - only a max: the target runs from 0 up to it
 * - only a min: anything over it is in target, so it climbs the band but never leaves it
 * Null without a target: such a parameter has nothing to share the band with.
 */
export function targetPosition(v: number, band: { min: number | null; max: number | null }): number | null {
	if (!Number.isFinite(v)) return null;
	const { lo: L, hi: H } = TARGET_BAND;
	const ease = (d: number) => d / (d + 1);
	let { min, max } = band;
	if (min == null && max == null) return null;
	if (min != null && max == null) {
		const span = Math.abs(min) || 1;
		return v >= min ? L + (H - L) * ease((v - min) / span) : L - L * ease((min - v) / span);
	}
	if (min == null) min = Math.min(0, max!);
	if (!(max! > min)) max = min + (Math.abs(min) || 1);
	const span = max! - min;
	if (v > max!) return H + (1 - H) * ease((v - max!) / span);
	if (v < min) return L - L * ease((min - v) / span);
	return L + ((v - min) / span) * (H - L);
}
