// Species care (#20): the ranges a species wants (from FishBase, downloaded by
// each server), warnings against a tank's targets and counts, and a short,
// cautious list of well-known conflicts between species (compatibility.json,
// Waterline's own). Pure, so pages, the summary and the assistant share it.
import rules from './compatibility.json';
import { formatNumber, toDisplay, unitLabel, type UnitPrefs } from './units';

/** One species' care data, as the server keeps it (stored metric: °C, dGH, cm). */
export interface Care {
	/** FishBase's common name */
	fb?: string | null;
	temp?: [number, number] | null;
	ph?: [number, number] | null;
	/** general hardness, dGH */
	gh?: [number, number] | null;
	/** adult length, cm */
	length?: number | null;
	/** lives in schools or shoals */
	school?: boolean | null;
}

/** A tank's targets that matter to a species, stored units; missing when not tracked. */
export interface TankTargets {
	temp?: [number | null, number | null] | null;
	ph?: [number | null, number | null] | null;
	gh?: [number | null, number | null] | null;
}

/** A tank's targets from its parameters (stored units), the ones species care about. */
export function tankTargets(params: { key: string; min: number | null; max: number | null }[]): TankTargets {
	const t: TankTargets = {};
	for (const p of params) {
		if (p.min == null && p.max == null) continue;
		if (p.key === 'temp') t.temp = [p.min, p.max];
		else if (p.key === 'ph') t.ph = [p.min, p.max];
		else if (p.key === 'gh') t.gh = [p.min, p.max];
	}
	return t;
}

export interface Kept {
	/** scientific name, when known */
	s: string | null;
	name: string;
	count: number;
}

const rangeText = (r: [number, number], q: 'temp' | 'hardness' | 'none', prefs: UnitPrefs, decimals: number) => {
	const a = formatNumber(toDisplay(r[0], q, prefs), decimals);
	const b = formatNumber(toDisplay(r[1], q, prefs), decimals);
	const unit = q === 'none' ? '' : ` ${unitLabel(q, prefs)}`;
	return `${a === b ? a : `${a}–${b}`}${unit}`;
};

/** "20–26 °C · pH 5–7 · GH 1–2 dGH · up to 2.5 cm · in a group", in the keeper's units. */
export function careLine(care: Care, prefs: UnitPrefs): string {
	const parts: string[] = [];
	if (care.temp) parts.push(rangeText(care.temp, 'temp', prefs, prefs.unitSystem === 'imperial' ? 0 : 1));
	if (care.ph) parts.push(`pH ${rangeText(care.ph, 'none', prefs, 1)}`);
	if (care.gh) parts.push(`GH ${rangeText(care.gh, 'hardness', prefs, 0)}`);
	if (care.length) parts.push(`up to ${formatNumber(toDisplay(care.length, 'length', prefs), care.length < 10 ? 1 : 0)} ${unitLabel('length', prefs)}`);
	if (care.school) parts.push('in a group');
	return parts.join(' · ');
}

/** The middle of a target, or its one bound. */
function middle(t: [number | null, number | null]): number | null {
	const [lo, hi] = t;
	if (lo != null && hi != null) return (lo + hi) / 2;
	return lo ?? hi;
}

/**
 * Where a tank's targets and a species disagree: a target whose middle lies
 * outside the species' range. "Your tank's temperature target (24–28 °C) is
 * outside the Neon tetra's range (20–26 °C)". Cautious: a target that overlaps
 * the range at all passes.
 */
export function targetWarnings(name: string, care: Care, targets: TankTargets, prefs: UnitPrefs): string[] {
	const out: string[] = [];
	const check = (label: string, t: [number | null, number | null] | null | undefined, r: [number, number] | null | undefined, q: 'temp' | 'hardness' | 'none', decimals: number) => {
		if (!t || !r) return;
		const m = middle(t);
		if (m == null) return;
		const lo = t[0] ?? m;
		const hi = t[1] ?? m;
		if (hi < r[0] || lo > r[1] || m < r[0] || m > r[1]) {
			const target = t[0] != null && t[1] != null ? rangeText([t[0], t[1]], q, prefs, decimals) : rangeText([m, m], q, prefs, decimals);
			out.push(`▲ Your tank's ${label} target (${target}) is outside the ${name}'s range (${rangeText(r, q, prefs, decimals)})`);
		}
	};
	check('temperature', targets.temp, care.temp, 'temp', prefs.unitSystem === 'imperial' ? 0 : 1);
	check('pH', targets.ph, care.ph, 'none', 1);
	check('GH', targets.gh, care.gh, 'hardness', 0);
	return out;
}

/** The smallest group a schooling species is happy in. */
export const GROUP_MIN = 6;

const genusOf = (s: string) => s.split(' ')[0];
const matches = (s: string, pattern: string) => s === pattern || (!pattern.includes(' ') && genusOf(s) === pattern);
const inList = (s: string, list: string[]) => list.some((p) => matches(s, p));

/** Lives in a school: FishBase says so, or it's on the hobby's list of shoalers. */
export function isSchooling(s: string | null, care?: Care | null): boolean {
	if (care?.school) return true;
	return !!s && inList(s, rules.schooling);
}

/** "Corydoras do best in groups of 6 or more · you have 3" */
export function groupWarning(kept: Kept, care?: Care | null): string | null {
	if (!kept.s || kept.count >= GROUP_MIN || !isSchooling(kept.s, care)) return null;
	return `▲ ${kept.name} do best in groups of ${GROUP_MIN} or more · you have ${kept.count}`;
}

const sideMatches = (s: string, side: string[]) =>
	side.some((p) => (p === '*small' ? inList(s, rules.small) : p === '*tropical' ? inList(s, rules.tropical) : p === '*community' ? inList(s, rules.community) : matches(s, p)));

/**
 * Well-known conflicts among what's kept together, each once:
 * "▲ Betta · Guppy: Bettas and guppies often don't get along: …".
 */
export function compatibilityWarnings(kept: Kept[]): string[] {
	const known = kept.filter((k): k is Kept & { s: string } => !!k.s);
	const out: string[] = [];
	const seen = new Set<string>();
	for (const rule of rules.pairs) {
		const as = known.filter((k) => sideMatches(k.s, rule.a));
		const bs = known.filter((k) => sideMatches(k.s, rule.b));
		for (const a of as) {
			for (const b of bs) {
				if (a === b || (rule.different && a.s === b.s)) continue;
				const key = [a.s, b.s].sort().join('|') + rule.text;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(`▲ ${a.name} · ${b.name}: ${rule.text.replace('{a}', a.name).replace('{b}', b.name)}`);
			}
		}
	}
	for (const rule of rules.groups) {
		for (const k of known) {
			if (sideMatches(k.s, rule.a) && k.count >= rule.min) out.push(`▲ ${k.name} × ${k.count}: ${rule.text}`);
		}
	}
	return out;
}

/**
 * Everything worth checking for a tank: targets against each species' ranges,
 * group sizes, and conflicts. `careOf` gives a species' data, or null.
 */
export function tankWarnings(kept: Kept[], careOf: (s: string) => Care | null, targets: TankTargets, prefs: UnitPrefs): string[] {
	const out: string[] = [];
	for (const k of kept) {
		const care = k.s ? careOf(k.s) : null;
		if (care) out.push(...targetWarnings(k.name, care, targets, prefs));
		const g = groupWarning(k, care);
		if (g) out.push(g);
	}
	out.push(...compatibilityWarnings(kept));
	return out;
}
