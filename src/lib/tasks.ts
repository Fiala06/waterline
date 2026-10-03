// Task scheduling and due-state logic (shared by server and UI).
import { addDays, daysBetween, fmtDate, isDate } from './time';
import { reviewEvery } from './review';

interface Schedulable {
	recurring: boolean;
	intervalDays: number | null;
	scheduleMode: 'completion' | 'fixed' | 'weekdays';
	nextDue: string | null;
	/** "1,3,5" (0 Sunday … 6 Saturday), for scheduleMode weekdays */
	weekdays?: string | null;
	/** the last day it's due ('YYYY-MM-DD'): a course of doses, a round of treatments */
	endsOn?: string | null;
}

export const WEEKDAYS = [
	{ day: 1, short: 'Mon', letter: 'M', name: 'Monday' },
	{ day: 2, short: 'Tue', letter: 'T', name: 'Tuesday' },
	{ day: 3, short: 'Wed', letter: 'W', name: 'Wednesday' },
	{ day: 4, short: 'Thu', letter: 'T', name: 'Thursday' },
	{ day: 5, short: 'Fri', letter: 'F', name: 'Friday' },
	{ day: 6, short: 'Sat', letter: 'S', name: 'Saturday' },
	{ day: 0, short: 'Sun', letter: 'S', name: 'Sunday' }
] as const;

/** "1,3,5" → [1, 3, 5]; anything else is left out. */
export function parseWeekdays(s: string | null | undefined): number[] {
	const days = new Set(
		(s ?? '')
			.split(',')
			.filter((d) => d.trim() !== '')
			.map(Number)
			.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
	);
	return [...days].sort((a, b) => a - b);
}

const weekdayOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();

/** The first of `days` on or after `date` ('YYYY-MM-DD'). */
export function onOrAfterWeekday(date: string, days: number[]): string {
	if (!days.length) return date;
	let d = date;
	while (!days.includes(weekdayOf(d))) d = addDays(d, 1);
	return d;
}

/** The date a task is actually due: a snooze moves only this occurrence. */
export function effectiveDue(task: { nextDue: string | null; snoozedUntil?: string | null }): string | null {
	if (!task.nextDue) return null;
	return task.snoozedUntil && task.snoozedUntil > task.nextDue ? task.snoozedUntil : task.nextDue;
}

/**
 * Next due date after completing on `doneOn` ('YYYY-MM-DD').
 * - one-off: null (task is closed)
 * - from completion: doneOn + interval
 * - fixed calendar: step the current due date forward by the interval until it is after today
 * - on set days: the next of those days after the due date (or after the day it's done, if later),
 *   so doing Wednesday's dose early on Monday doesn't bring Wednesday back
 */
export function nextDueAfterCompletion(task: Schedulable, doneOn: string, today: string): string | null {
	const next = nextOccurrence(task, doneOn, today);
	// a course ends: nothing is due after its last day
	return next && task.endsOn && next > task.endsOn ? null : next;
}

function nextOccurrence(task: Schedulable, doneOn: string, today: string): string | null {
	// on set days: the next of them after this one, or after the day it's done if that's later
	if (task.recurring && task.scheduleMode === 'weekdays') {
		const days = parseWeekdays(task.weekdays);
		if (!days.length) return null;
		const from = task.nextDue && task.nextDue > doneOn ? task.nextDue : doneOn;
		return onOrAfterWeekday(addDays(from, 1), days);
	}
	if (!task.recurring || !task.intervalDays) return null;
	if (task.scheduleMode === 'completion' || !task.nextDue) return addDays(doneOn, task.intervalDays);
	let next = addDays(task.nextDue, task.intervalDays);
	while (daysBetween(today, next) <= 0) next = addDays(next, task.intervalDays);
	return next;
}

/** Every day a task comes up from its next due date to `endsOn` (inclusive), at most `max` of them. */
export function occurrencesUntil(task: Schedulable, endsOn: string, max = 1000): string[] {
	if (!task.nextDue || task.nextDue > endsOn) return [];
	const days = task.scheduleMode === 'weekdays' ? parseWeekdays(task.weekdays) : [];
	const step = task.scheduleMode === 'weekdays' ? (days.length ? 1 : 0) : (task.intervalDays ?? 0);
	if (!task.recurring || !step) return [task.nextDue];
	const out: string[] = [];
	let d = task.scheduleMode === 'weekdays' ? onOrAfterWeekday(task.nextDue, days) : task.nextDue;
	while (d <= endsOn && out.length < max) {
		out.push(d);
		d = task.scheduleMode === 'weekdays' ? onOrAfterWeekday(addDays(d, 1), days) : addDays(d, step);
	}
	return out;
}

/** The day of the Nth occurrence counting the next due date as the first: "after 5 doses" → a date. */
export function endsAfterTimes(task: Schedulable, times: number): string | null {
	if (!task.nextDue || !Number.isInteger(times) || times < 1) return null;
	const days = task.scheduleMode === 'weekdays' ? parseWeekdays(task.weekdays) : [];
	if (!task.recurring || (task.scheduleMode === 'weekdays' ? !days.length : !task.intervalDays)) return task.nextDue;
	let d = task.scheduleMode === 'weekdays' ? onOrAfterWeekday(task.nextDue, days) : task.nextDue;
	for (let i = 1; i < times; i++) d = task.scheduleMode === 'weekdays' ? onOrAfterWeekday(addDays(d, 1), days) : addDays(d, task.intervalDays!);
	return d;
}

/** A course's line: "3 doses left · ends Oct 9" (null for a task without an end). */
export function courseText(task: Schedulable & { kind?: string }): string | null {
	if (!task.endsOn || !task.nextDue) return null;
	const n = occurrencesUntil(task, task.endsOn).length;
	const word = task.kind === 'dosing' ? 'dose' : task.kind === 'feeding' ? 'feeding' : 'time';
	return `${n} ${word}${n === 1 ? '' : 's'} left · ends ${fmtDate(task.endsOn)}`;
}

export type DueLevel = 'bad' | 'warn' | 'ok';
export const DUE_SOON_DAYS = 3;

export interface DueInfo {
	days: number;
	level: DueLevel;
	/** "✕ Overdue 1 day", "▲ Due today", "▲ Due in 2 days · Sep 27", "Oct 3" */
	text: string;
	section: 'overdue' | 'soon' | 'later';
}

export function dueInfo(nextDue: string, today: string): DueInfo {
	const days = daysBetween(today, nextDue);
	if (days < 0) {
		const n = -days;
		return { days, level: 'bad', text: `✕ Overdue ${n} day${n === 1 ? '' : 's'}`, section: 'overdue' };
	}
	if (days === 0) return { days, level: 'warn', text: '▲ Due today', section: 'soon' };
	if (days <= DUE_SOON_DAYS) {
		return {
			days,
			level: 'warn',
			text: `▲ Due in ${days} day${days === 1 ? '' : 's'} · ${fmtDate(nextDue)}`,
			section: 'soon'
		};
	}
	return { days, level: 'ok', text: fmtDate(nextDue), section: 'later' };
}

/** "every 7 days", "every 2 weeks", "Mon, Wed, Fri", "every day but Sun", "one-off" */
export function intervalText(task: { recurring: boolean; intervalDays: number | null; scheduleMode?: string; weekdays?: string | null; kind?: string; nextDue?: string | null; endsOn?: string | null }): string {
	const base = repeatText(task);
	// a course: "every 2 days · 3 doses left · ends Oct 9"
	const course = task.endsOn && task.nextDue ? courseText({ ...task, scheduleMode: (task.scheduleMode ?? 'completion') as Schedulable['scheduleMode'], nextDue: task.nextDue }) : null;
	return course ? `${base} · ${course}` : base;
}

function repeatText(task: { recurring: boolean; intervalDays: number | null; scheduleMode?: string; weekdays?: string | null; kind?: string }): string {
	if (task.recurring && task.scheduleMode === 'weekdays') {
		const days = parseWeekdays(task.weekdays);
		if (days.length === 7) return 'every day';
		const on = WEEKDAYS.filter((w) => days.includes(w.day));
		if (days.length === 6) return `every day but ${WEEKDAYS.find((w) => !days.includes(w.day))!.short}`;
		if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Mon–Fri';
		return on.map((w) => w.short).join(', ') || 'one-off';
	}
	if (!task.recurring || !task.intervalDays) return 'one-off';
	const d = task.intervalDays;
	// the setup review (#30) is set in months
	if (task.kind === 'review' && reviewEvery(d)) return reviewEvery(d)!;
	if (d % 7 === 0 && d >= 14) return `every ${d / 7} weeks`;
	return d === 1 ? 'every day' : `every ${d} days`;
}

/** Snooze choices (G8): tomorrow, in 3 days, next weekend (the coming Saturday after this week's). */
export function snoozeOptions(today: string, due: string) {
	// Not due yet: push it back from its due date (a date before it would do nothing).
	if (due > today) {
		return [
			{ label: 'A day later', date: addDays(due, 1) },
			{ label: '3 days later', date: addDays(due, 3) },
			{ label: 'A week later', date: addDays(due, 7) }
		];
	}
	const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 Sun … 6 Sat
	const toSat = ((6 - dow + 7) % 7) || 7;
	// never the same day as "In 3 days" (a Wednesday's Saturday): the one after
	const weekend = addDays(today, toSat <= 3 ? toSat + 7 : toSat);
	return [
		{ label: 'Tomorrow', date: addDays(today, 1) },
		{ label: 'In 3 days', date: addDays(today, 3) },
		{ label: 'Next weekend', date: weekend }
	];
}

/** Example under each schedule mode (15): "Done late on Sep 26 → next due Oct 3". */
export function scheduleExamples(nextDue: string, intervalDays: number) {
	const late = addDays(nextDue, 1);
	const weekday = new Date(nextDue + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
	return {
		completion: `Done late on ${fmtDate(late)} → next due ${fmtDate(addDays(late, intervalDays))}`,
		fixed:
			intervalDays % 7 === 0
				? `Always every ${intervalDays === 7 ? '' : `${intervalDays / 7} weeks on `}${weekday}, whenever it's done`
				: `Always ${fmtDate(addDays(nextDue, intervalDays))} next, whenever it's done`
	};
}

/** "Remind me about this tank": when, in one tap, or on a date. */
export const REMIND_WHEN = [
	{ value: '1', label: 'Tomorrow' },
	{ value: '3', label: 'In 3 days' },
	{ value: '7', label: 'Next week' },
	{ value: '14', label: 'In 2 weeks' },
	{ value: 'date', label: 'On a date' }
] as const;

/** The day a reminder is due: days from today, or a date after today. Null when it's not one. */
export function reminderDue(when: string, date: string, today: string): string | null {
	if (when === 'date') return isDate(date) && date > today ? date : null;
	const days = Number(when);
	return REMIND_WHEN.some((w) => w.value === when) && Number.isInteger(days) ? addDays(today, days) : null;
}

/** Food for a feeding routine: how it's measured. */
export const FEED_UNITS = ['pinches', 'pellets', 'cubes', 'wafers', 'scoops', 'g'];

const ONE: Record<string, string> = { drops: 'drop', pumps: 'pump', pinches: 'pinch', pellets: 'pellet', cubes: 'cube', wafers: 'wafer', scoops: 'scoop' };
/** "1 pump", "2 pumps", "5 mL": an amount with its unit. */
export function amountText(amount: number | null | undefined, unit: string | null | undefined): string | null {
	if (amount == null) return null;
	const n = Math.round(amount * 100) / 100;
	const u = unit ? (n === 1 ? (ONE[unit] ?? unit) : unit) : '';
	return `${n}${u ? ` ${u}` : ''}`;
}

/** A routine's line under its name: "1 pump · Mon, Wed, Fri". */
export function routineLine(task: { kind: string; amount: number | null; amountUnit: string | null; recurring: boolean; intervalDays: number | null; scheduleMode?: string; weekdays?: string | null; nextDue?: string | null; endsOn?: string | null }) {
	return [amountText(task.amount, task.amountUnit), intervalText(task)].filter(Boolean).join(' · ');
}

export const isRoutine = (kind: string) => kind === 'dosing' || kind === 'feeding';
