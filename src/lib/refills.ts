// CO₂ cylinder refills (#368): how long a fill lasts, worked out from the days
// the keeper logged a refill, and when the next one is likely. Dates are
// YYYY-MM-DD in the keeper's time zone.
import { addDays, daysBetween, fmtDate } from './time';

/** How many of the latest fills the average is taken over, so a changed bubble rate shows soon. */
export const REFILL_WINDOW = 5;

export interface RefillStats {
	/** refills logged, a day counted once */
	count: number;
	/** the latest refill's day */
	last: string | null;
	/** how long a fill lasts, in days: the average of the latest fills; null until there are two refills */
	avgDays: number | null;
	/** how many fills that's the average of */
	fills: number;
	/** the day the cylinder is likely empty: the last refill plus a fill */
	expected: string | null;
}

export function refillStats(days: string[]): RefillStats {
	const sorted = [...new Set(days)].sort();
	const last = sorted.at(-1) ?? null;
	const gaps = sorted.slice(1).map((d, i) => daysBetween(sorted[i], d));
	const recent = gaps.slice(-REFILL_WINDOW);
	const avgDays = recent.length ? Math.max(1, Math.round(recent.reduce((n, g) => n + g, 0) / recent.length)) : null;
	return { count: sorted.length, last, avgDays, fills: recent.length, expected: last && avgDays ? addDays(last, avgDays) : null };
}

const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** "about 12 days", "about 6 weeks", "about 4 months" */
export function lastsText(days: number): string {
	if (days < 14) return `about ${n(days, 'day')}`;
	if (days < 60) return `about ${n(Math.round(days / 7), 'week')}`;
	return `about ${n(Math.round(days / 30.44), 'month')}`;
}

/** "a fill lasts about 4 months (average of 3)"; with one fill measured, "the last fill lasted about 4 months" */
export function fillText(s: Pick<RefillStats, 'avgDays' | 'fills'>): string | null {
	if (s.avgDays == null) return null;
	return s.fills > 1 ? `a fill lasts ${lastsText(s.avgDays)} (average of ${s.fills})` : `the last fill lasted ${lastsText(s.avgDays)}`;
}

/** The item's line: "Last refilled Nov 24 · a fill lasts about 4 months (average of 3)" */
export function refillLine(s: RefillStats): string | null {
	if (!s.last) return null;
	return [`Last refilled ${fmtDate(s.last)}`, fillText(s)].filter(Boolean).join(' · ');
}

/** How long before the cylinder is likely empty it counts as running low: two weeks, less for a short fill. */
export const lowLeadDays = (avgDays: number) => Math.min(14, Math.max(2, Math.round(avgDays / 4)));

/** Whether the cylinder is likely running low today, and the words for it (the glyph and word, never a tint alone). */
export function refillDue(s: RefillStats, today: string): { low: boolean; text: string; level: 'ok' | 'warn' } | null {
	if (!s.expected || s.avgDays == null) return null;
	const low = daysBetween(today, s.expected) <= lowLeadDays(s.avgDays);
	return low
		? { low, level: 'warn', text: `▲ Likely running low · a fill usually lasts until about ${fmtDate(s.expected)}` }
		: { low, level: 'ok', text: `✓ Next refill around ${fmtDate(s.expected)}` };
}
