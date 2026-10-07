// Maintenance routines (#92): a named sequence of log steps ("Sunday
// maintenance": 40% water change, dose 6 mL, trim, test), each a log form
// filled in, the same kinds and fields as a Quick log favorite. Running one
// walks the steps in order, with Skip; the run's state is in the address, so
// it works without scripts and survives the form pages in between.
import { favoriteHref, favoriteSub, type FavoriteKind, type FavoriteFields } from './favorites';

export interface RoutineStep {
	kind: FavoriteKind;
	label: string;
	fields: FavoriteFields;
}

export const MAX_STEPS = 12;

export interface RunState {
	/** the step up next (0-based); steps.length when the run is over */
	i: number;
	done: number[];
	skipped: number[];
}

const ints = (raw: string | null, max: number) =>
	(raw ?? '')
		.split(',')
		.filter((s) => s.trim() !== '')
		.map((s) => Number(s))
		.filter((n) => Number.isInteger(n) && n >= 0 && n < max)
		.filter((n, i, a) => a.indexOf(n) === i);

/** The run's state from the address: ?i=2&done=0&skipped=1 (anything odd is ignored). */
export function runState(params: URLSearchParams, stepCount: number): RunState {
	const done = ints(params.get('done'), stepCount);
	const skipped = ints(params.get('skipped'), stepCount).filter((n) => !done.includes(n));
	const raw = Number(params.get('i') ?? 0);
	const i = Number.isInteger(raw) ? Math.min(Math.max(0, raw), stepCount) : 0;
	return { i, done, skipped };
}

/** The address of the run page in a state. */
export function runHref(base: string, s: RunState): string {
	// commas stay as they are: readable, and no double escaping once this sits inside a form's `from`
	let q = `i=${s.i}`;
	if (s.done.length) q += `&done=${s.done.join(',')}`;
	if (s.skipped.length) q += `&skipped=${s.skipped.join(',')}`;
	return `${base}?${q}`;
}

/** The state after taking step `i` (logging it), or skipping it: the next step is up. */
export const afterStep = (s: RunState, taken: boolean): RunState => ({
	i: s.i + 1,
	done: taken ? [...s.done, s.i] : s.done,
	skipped: taken ? s.skipped : [...s.skipped, s.i]
});

/** The log form a step opens, coming back to the run page with the step counted as done. */
export function stepHref(step: RoutineStep, tankId: string, base: string, s: RunState): string {
	const href = favoriteHref(step, tankId);
	const from = runHref(base, afterStep(s, true));
	return `${href}&from=${encodeURIComponent(from)}`;
}

/** "40% · Tap" under a step's name, or null. */
export const stepSub = (step: RoutineStep, volUnit: string) => favoriteSub(step.kind, step.fields, volUnit);

/** "3 logged · 1 skipped" at the end; "4 steps" before a run. */
export function runSummary(s: RunState, stepCount: number): string {
	if (s.i < stepCount) return `Step ${s.i + 1} of ${stepCount}`;
	const parts = [`${s.done.length} logged`];
	if (s.skipped.length) parts.push(`${s.skipped.length} skipped`);
	return parts.join(' · ');
}
