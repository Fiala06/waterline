// The setup review (#30): every few months a task asks whether the tank's
// settings are still right (the light timer moved, a heater was replaced,
// the shrimp are gone). Its page checks four parts; these are the rules
// shared by the page, the task and its History entry.
import { addDays } from './time';

export const REVIEW_SECTIONS = [
	{ key: 'details', label: 'Tank details' },
	{ key: 'equipment', label: 'Equipment' },
	{ key: 'targets', label: 'Target ranges' },
	{ key: 'livestock', label: 'Livestock & plants' }
] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number]['key'];
export type ReviewChecks = Partial<Record<ReviewSection, string>>;

export const isReviewSection = (v: unknown): v is ReviewSection => REVIEW_SECTIONS.some((s) => s.key === v);

/** How often, as days on the task: a month, 3 months (the default), 6 months. */
export const REVIEW_INTERVALS = [
	{ days: 30, label: 'Every month' },
	{ days: 91, label: 'Every 3 months' },
	{ days: 182, label: 'Every 6 months' }
] as const;
export const REVIEW_DEFAULT_DAYS = 91;
export const REVIEW_TASK_NAME = 'Review tank setup';
/** What the task is for, under its name in Due and Tasks (#69). */
export const REVIEW_ABOUT = 'Check the tank’s details, equipment, targets and livestock are still right.';

/** A review task's values: first due one interval from today. */
export function newReviewTask(tankId: string, today: string, days = REVIEW_DEFAULT_DAYS) {
	return {
		tankId,
		name: REVIEW_TASK_NAME,
		kind: 'review' as const,
		recurring: true,
		intervalDays: days,
		scheduleMode: 'completion' as const,
		nextDue: addDays(today, days),
		openFormOnDone: false
	};
}

/** "every 3 months" for the review's own intervals; null for any other number of days. */
export function reviewEvery(days: number | null | undefined): string | null {
	const i = REVIEW_INTERVALS.find((r) => r.days === days);
	return i ? i.label.replace('Every', 'every') : null;
}

/** The interval picked in Tank settings: one of the review's, or off. */
export function parseReviewEvery(v: unknown): number | 'off' | null {
	if (v === 'off') return 'off';
	const n = Number(v);
	return REVIEW_INTERVALS.some((r) => r.days === n) ? n : null;
}

/**
 * A part of the setup counts as checked in this round if it was checked after
 * the last review was finished (or, before there was one, at all).
 */
export function sectionChecked(checks: ReviewChecks, section: ReviewSection, lastReviewAt: string | null): boolean {
	const at = checks[section];
	return !!at && (!lastReviewAt || at > lastReviewAt);
}

// Equipment that needs looking after: a filter, pump, skimmer or CO₂ not
// serviced in this long gets a note on the review.
const SERVICED_TYPES = new Set(['filter', 'pump', 'skimmer', 'co2']);
export const SERVICE_FLAG_DAYS = 182;
/** The kinds of equipment that get serviced (and a Serviced today button on the review). */
export const isServiced = (type: string) => SERVICED_TYPES.has(type);

/** "▲ Not serviced since 12 Mar", "▲ No service logged", or null when it's fine or isn't the kind that's serviced. */
export function serviceFlag(
	item: { type: string; installedAt: string | null; lastServicedAt: string | null },
	today: string,
	fmt: (date: string) => string
): string | null {
	if (!isServiced(item.type)) return null;
	const cutoff = addDays(today, -SERVICE_FLAG_DAYS);
	const last = item.lastServicedAt?.slice(0, 10) ?? null;
	if (last) return last < cutoff ? `▲ Not serviced since ${fmt(last)}` : null;
	// never serviced: only worth saying once it's been in a while
	const installed = item.installedAt?.slice(0, 10) ?? null;
	return !installed || installed < cutoff ? '▲ No service logged' : null;
}

/** The History entry's title: "Reviewed tank setup", with what had changed since the last one. */
export function reviewTitle(data: { changed?: unknown }): string {
	const changed = Array.isArray(data.changed) ? data.changed.filter(isReviewSection) : [];
	if (!changed.length) return 'Reviewed tank setup · all still right';
	const names = REVIEW_SECTIONS.filter((s) => changed.includes(s.key)).map((s) => s.label.toLowerCase());
	const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
	return `Reviewed tank setup · ${list} changed`;
}
