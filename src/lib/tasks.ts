// Task scheduling and due-state logic (shared by server and UI).
import { addDays, daysBetween, fmtDate } from './time';

interface Schedulable {
	recurring: boolean;
	intervalDays: number | null;
	scheduleMode: 'completion' | 'fixed';
	nextDue: string | null;
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
 */
export function nextDueAfterCompletion(task: Schedulable, doneOn: string, today: string): string | null {
	if (!task.recurring || !task.intervalDays) return null;
	if (task.scheduleMode === 'completion' || !task.nextDue) return addDays(doneOn, task.intervalDays);
	let next = addDays(task.nextDue, task.intervalDays);
	while (daysBetween(today, next) <= 0) next = addDays(next, task.intervalDays);
	return next;
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

/** "every 7 days", "every 2 weeks", "one-off" */
export function intervalText(task: { recurring: boolean; intervalDays: number | null }): string {
	if (!task.recurring || !task.intervalDays) return 'one-off';
	const d = task.intervalDays;
	if (d % 7 === 0 && d >= 14) return `every ${d / 7} weeks`;
	return d === 1 ? 'every day' : `every ${d} days`;
}

/** Snooze choices (G8): tomorrow, in 3 days, next weekend (the coming Saturday after this week's). */
export function snoozeOptions(today: string, due: string) {
	const base = due > today ? due : today;
	const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 Sun … 6 Sat
	const toSat = ((6 - dow + 7) % 7) || 7;
	const weekend = addDays(today, toSat < 3 ? toSat + 7 : toSat);
	return [
		{ label: 'Tomorrow', date: addDays(base, 1) },
		{ label: 'In 3 days', date: addDays(base, 3) },
		{ label: 'Next weekend', date: weekend }
	].filter((o, i, all) => all.findIndex((x) => x.date === o.date) === i);
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
