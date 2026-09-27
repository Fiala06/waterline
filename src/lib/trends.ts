// Spotting trends: a plain note about where a parameter is heading,
// from its recent readings. Deliberately cautious, so a note means something:
// a run of tests that each rose (or fell), and, when the readings since the
// last water change line up well, when that pace would cross a target limit.
import { displayValue, fmtTarget, fmtValue, paramDecimals, paramUnit, type ParamLike } from './params';
import type { UnitPrefs } from './units';

export interface TrendNote {
	parameterId: string;
	direction: 'up' | 'down';
	/** heading for a target limit, or further past one */
	warn: boolean;
	text: string;
}

const DAY = 86_400_000;
/** Tests in a row, each higher (or lower) than the one before, to count as a run. */
export const MIN_RUN = 3;
/** How far ahead a crossing is worth a mention. */
export const HORIZON_DAYS = 14;
/** How well the readings must fit a straight line (R²) to project it. */
const MIN_FIT = 0.6;

/** Least-squares line through the readings: slope in stored units per day, and R². */
function fit(points: { t: number; value: number }[]) {
	const xs = points.map((p) => p.t / DAY);
	const ys = points.map((p) => p.value);
	const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
	const my = ys.reduce((a, b) => a + b, 0) / ys.length;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < xs.length; i++) {
		sxy += (xs[i] - mx) * (ys[i] - my);
		sxx += (xs[i] - mx) ** 2;
		syy += (ys[i] - my) ** 2;
	}
	if (!sxx || !syy) return null;
	return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy) };
}

/**
 * What stands out about one parameter, or null. `points` are its readings,
 * oldest first, in stored units; `since` is the last water change, which
 * resets most parameters, so the pace is measured from there.
 */
export function trendNote(
	p: ParamLike & { id: string },
	points: { t: number; value: number }[],
	opts: { prefs: UnitPrefs; since?: number | null }
): TrendNote | null {
	if (points.length < 2) return null;
	const { prefs } = opts;
	const unit = paramUnit(p, prefs) ? ` ${paramUnit(p, prefs)}` : '';
	// compared as shown, so a change too small to display isn't a rise
	const dec = paramDecimals(p, prefs);
	const shown = points.map((x) => Math.round(displayValue(p, x.value, prefs) * 10 ** dec));
	let run = 0;
	let dir = 0;
	for (let i = shown.length - 1; i > 0; i--) {
		const d = Math.sign(shown[i] - shown[i - 1]);
		if (!d || (dir && d !== dir)) break;
		dir = d;
		run++;
	}
	const last = points[points.length - 1].value;
	const hasRun = run >= MIN_RUN;

	// the pace since the last water change, if the readings there line up and
	// the latest test still moved that way (5, 4, 3, 3 has leveled off)
	const recent = opts.since ? points.filter((x) => x.t >= opts.since!) : points;
	const line = recent.length >= 3 && recent[recent.length - 1].t - recent[0].t >= 2 * DAY ? fit(recent) : null;
	const lastStep = Math.sign(shown[shown.length - 1] - shown[shown.length - 2]);
	let cross: { limit: number; days: number } | null = null;
	if (line && line.r2 >= MIN_FIT && Math.sign(line.slope) === lastStep) {
		// a lower limit of 0 is "as low as possible": falling toward it is fine
		const limit = line.slope > 0 ? p.max : p.min ? p.min : null;
		if (limit != null && (line.slope > 0 ? last < limit : last > limit)) {
			const days = (limit - last) / line.slope;
			if (days > 0 && days <= HORIZON_DAYS) cross = { limit, days };
		}
	}
	if (!hasRun && !cross) return null;

	const up = hasRun ? dir > 0 : line!.slope > 0;
	const soon = cross && (cross.days < 1.5 ? 'in a day or so' : `in about ${Math.round(cross.days)} days`);
	const course = cross && `on course to ${up ? 'pass' : 'drop below'} ${fmtTarget(p, cross.limit, prefs)}${unit} ${soon}`;
	const fromTo = hasRun && `${fmtValue(p, points[points.length - 1 - run].value, prefs)} → ${fmtValue(p, last, prefs)}${unit}`;
	const text = hasRun
		? `${p.name} has ${up ? 'risen' : 'dropped'} in each of your last ${run} tests${course ? ` (${fromTo}) and is ${course}` : `: ${fromTo}`}.`
		: `${p.name} is ${course}.`;
	// past a limit and still moving away from the target
	const beyond = up ? p.max != null && last > p.max : !!p.min && last < p.min;
	return { parameterId: p.id, direction: up ? 'up' : 'down', warn: !!cross || beyond, text };
}
