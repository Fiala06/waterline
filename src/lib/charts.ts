// Time ranges on the Charts screen.
export const CHART_RANGES = [
	{ key: '2w', label: '2W', days: 14 },
	{ key: '1m', label: '1M', days: 30 },
	{ key: '3m', label: '3M', days: 91 },
	{ key: '1y', label: '1Y', days: 365 },
	{ key: 'all', label: 'All', days: 0 }
] as const;

/**
 * Round values for a y-axis from lo to hi, about `divisions` apart (steps of
 * 1, 2, 2.5 or 5 × a power of ten). Never just one tick when two would fit:
 * 0–38 in 3 is 10, 20, 30, not a lone 20.
 */
export function niceTicks(lo: number, hi: number, divisions: number): number[] {
	const raw = (hi - lo) / divisions;
	if (!(raw > 0) || !Number.isFinite(raw)) return [];
	const mag = 10 ** Math.floor(Math.log10(raw));
	const steps = [0.5, 1, 2, 2.5, 5, 10].map((m) => m * mag);
	const at = (step: number) => {
		const out: number[] = [];
		for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6 || 0);
		return out;
	};
	const i = steps.findIndex((s) => s >= raw - 1e-12);
	const out = at(steps[i]);
	return out.length < 2 && i > 0 ? at(steps[i - 1]) : out;
}

/**
 * What a chart's y-axis says, in at most `room` characters: "Nitrate (ppm)",
 * or just "ppm" when that's too long, or the name cut short ("Total dissol…").
 */
export function yAxisTitle(name: string, unit: string, room: number): string {
	const whole = unit ? `${name} (${unit})` : name;
	if (whole.length <= room) return whole;
	if (unit && unit.length <= room) return unit;
	return room > 1 ? whole.slice(0, room - 1) + '…' : '';
}
