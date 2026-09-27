// Spotting trends: a plain note about where a parameter is heading,
// from its recent readings. Deliberately cautious, so a note means something:
// a run of tests that each rose (or fell), and, when the readings since the
// last water change line up well, when that pace would cross a target limit.
import { displayValue, fmtTarget, fmtValue, paramDecimals, paramUnit, type ParamLike } from './params';
import { formatNumber, type UnitPrefs } from './units';

export interface TrendNote {
	parameterId: string;
	/** a run of tests or a pace (run), a drift between water changes, a change after dosing */
	kind: 'run' | 'drift' | 'dose';
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
	return { parameterId: p.id, kind: 'run', direction: up ? 'up' : 'down', warn: !!cross || beyond, text };
}

// ── Patterns ────────────────────────────────────────────────────────────────
// What keeps happening, not just lately: how a parameter moves between water
// changes, and how it changes after a dose. Just as cautious: at least 3 times,
// and 3 in 4 of them (or more) the same way, by an amount the app would show.

/** Times something must have happened to be a pattern. */
export const MIN_TIMES = 3;
/** How near a dose a test must be to count as before or after it. */
const NEAR = 2 * DAY;
/** The stretches between water changes looked at, newest first. */
const STRETCHES = 6;

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Most of these the same way (3 in 4 or more, at least MIN_TIMES): that sign, and how many. */
function agree(xs: number[]): { sign: number; k: number } | null {
	for (const sign of [1, -1]) {
		const k = xs.filter((x) => Math.sign(x) === sign).length;
		if (k >= MIN_TIMES && k >= Math.ceil(xs.length * 0.75)) return { sign, k };
	}
	return null;
}

/** A change in stored units as the keeper reads it ("1 dKH", "0.2"), or null when it'd show as 0. */
function shownChange(p: ParamLike, base: number, change: number, prefs: UnitPrefs) {
	const d = Math.abs(displayValue(p, base + change, prefs) - displayValue(p, base, prefs));
	const dec = paramDecimals(p, prefs);
	const s = formatNumber(d, dec);
	return Number(s) === 0 ? null : s;
}

/**
 * Patterns in one parameter's readings (oldest first, stored units) around
 * the tank's water changes and doses (their times, oldest first).
 */
export function patternNotes(
	p: ParamLike & { id: string },
	points: { t: number; value: number }[],
	around: { waterChanges: number[]; doses: { t: number; product: string }[] },
	opts: { prefs: UnitPrefs }
): TrendNote[] {
	const { prefs } = opts;
	if (points.length < 3) return [];
	const unit = paramUnit(p, prefs) ? ` ${paramUnit(p, prefs)}` : '';
	const last = points[points.length - 1].value;
	const notes: TrendNote[] = [];

	// between water changes: each stretch's pace, per week
	const wcs = around.waterChanges;
	const paces: number[] = [];
	for (let i = wcs.length - 1; i >= 0 && paces.length < STRETCHES; i--) {
		const end = i + 1 < wcs.length ? wcs[i + 1] : Infinity;
		const inside = points.filter((x) => x.t > wcs[i] && x.t < end);
		if (inside.length < 2 || inside[inside.length - 1].t - inside[0].t < 2 * DAY) continue;
		const line = inside.length >= 3 ? fit(inside) : null;
		const slope = line ? line.slope : (inside[inside.length - 1].value - inside[0].value) / ((inside[inside.length - 1].t - inside[0].t) / DAY);
		paces.push(slope * 7);
	}
	const drift = agree(paces);
	const perWeek = drift && shownChange(p, last, median(paces.filter((x) => Math.sign(x) === drift.sign)), prefs);
	if (drift && perWeek) {
		notes.push({
			parameterId: p.id,
			kind: 'drift',
			direction: drift.sign > 0 ? 'up' : 'down',
			warn: false,
			text: `${p.name} drifts ${drift.sign > 0 ? 'up' : 'down'} about ${perWeek}${unit} a week between water changes (in ${drift.k} of your last ${paces.length}).`
		});
	}

	// after a dose: the test just before it against the one just after, per product,
	// next to how much it changes between two tests without one (which is the
	// drift, or noise): only a change well beyond that is the dose's
	const between = (a: number, b: number, ts: number[]) => ts.some((w) => w > a && w < b);
	const doseTimes = around.doses.map((d) => d.t);
	const usual: number[] = [];
	for (let i = 1; i < points.length; i++) {
		const [a, b] = [points[i - 1], points[i]];
		if (b.t - a.t <= 2 * NEAR && !between(a.t, b.t, doseTimes) && !between(a.t, b.t, wcs)) usual.push(b.value - a.value);
	}
	const byProduct = new Map<string, { name: string; changes: number[] }>();
	for (const d of around.doses) {
		const before = points.filter((x) => x.t < d.t && x.t >= d.t - NEAR).at(-1);
		const after = points.find((x) => x.t > d.t && x.t <= d.t + NEAR);
		// a water change in between would be the reason instead
		if (!before || !after || between(before.t, after.t, wcs)) continue;
		const key = d.product.trim().toLowerCase();
		const g = byProduct.get(key) ?? { name: '', changes: [] };
		g.name = d.product.trim(); // as it was last written
		g.changes.push(after.value - before.value);
		byProduct.set(key, g);
	}
	// dosed every time it's tested: nothing to compare with
	const base = usual.length >= MIN_TIMES ? median(usual) : null;
	const scatter = base == null ? 0 : median(usual.map((u) => Math.abs(u - base)));
	const doses = [...byProduct.values()]
		.map((g) => ({ ...g, effects: g.changes.map((c) => c - (base ?? 0)) }))
		.map((g) => ({ ...g, a: base == null ? null : agree(g.effects) }))
		.filter((g) => g.a)
		.sort((x, y) => y.changes.length - x.changes.length);
	for (const g of doses) {
		const effect = median(g.effects.filter((x) => Math.sign(x) === g.a!.sign));
		if (Math.abs(effect) < 2 * scatter) continue;
		const by = shownChange(p, last, effect, prefs);
		if (!by) continue;
		notes.push({
			parameterId: p.id,
			kind: 'dose',
			direction: g.a!.sign > 0 ? 'up' : 'down',
			warn: false,
			text: `${p.name} ${g.a!.sign > 0 ? 'rises' : 'dips'} about ${by}${unit} after dosing ${g.name} (${g.a!.k} of ${g.changes.length} times).`
		});
		break; // the product with the most doses tested around it
	}
	return notes;
}
