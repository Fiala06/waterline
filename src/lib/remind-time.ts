// When a task is pushed on its day (#180), and quiet hours. Times are the
// keeper's wall-clock 'HH:MM'; the scheduler compares them with the time in
// their own time zone, so a change of the clocks moves nothing.

/** What the task form offers: at the send time (null), around the tank's lights, or at a time. */
export type RemindAt = null | 'before_lights' | 'lights_off' | string;

/** How long before the lights come on a "Before lights on" task is pushed. */
export const BEFORE_LIGHTS_MIN = 30;
/** The latest a push can be set for: the scheduler runs every 5 minutes, and the next run is tomorrow (#231). */
export const LATEST_PUSH = '23:50';

const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) => {
	const d = ((m % 1440) + 1440) % 1440;
	return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};

/** A task's remind-at as stored, from the form: one of the choices, a valid time, or null. */
export function parseRemindAt(choice: string | null | undefined, time: string | null | undefined): RemindAt {
	if (choice === 'before_lights' || choice === 'lights_off') return choice;
	if (choice === 'time' && isTime(time)) return time;
	return null;
}

/** "Before lights on", "At lights off", "At 9:00 PM", or null at the send time: for a task's line and its form. */
export function remindAtText(at: RemindAt): string | null {
	if (at === 'before_lights') return 'Before lights on';
	if (at === 'lights_off') return 'At lights off';
	if (!isTime(at)) return null;
	const [h, m] = at.split(':').map(Number);
	return `At ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The tank's lights, first on and last off, from its schedule's periods; null without one. */
export function lightTimes(schedule: { periods: { on: string; off: string }[] } | null | undefined): { on: string; off: string } | null {
	const periods = (schedule?.periods ?? []).filter((p) => isTime(p.on) && isTime(p.off));
	if (!periods.length) return null;
	return { on: periods[0].on, off: periods[periods.length - 1].off };
}

/**
 * The time a task is pushed on its day: its own, or 30 minutes before the
 * lights come on, or when they go off; the send time when it has none, or
 * when it follows the lights and the tank has no light schedule.
 */
export function remindTime(at: RemindAt, sendTime: string, lights: { on: string; off: string } | null): string {
	let t = sendTime;
	if (at === 'before_lights' && lights) t = clock(minutes(lights.on) - BEFORE_LIGHTS_MIN);
	else if (at === 'lights_off' && lights) t = lights.off;
	else if (isTime(at)) t = at;
	return t > LATEST_PUSH ? LATEST_PUSH : t;
}

export interface Quiet {
	start: string;
	end: string;
}

/** Quiet hours as saved: both times, different, or none. */
export function quietOf(start: string | null | undefined, end: string | null | undefined): Quiet | null {
	return isTime(start) && isTime(end) && start !== end ? { start, end } : null;
}

/** Is this time inside quiet hours? From the start up to (not including) the end, across midnight too. */
export function inQuiet(time: string, quiet: Quiet | null): boolean {
	if (!quiet) return false;
	return quiet.start < quiet.end ? time >= quiet.start && time < quiet.end : time >= quiet.start || time < quiet.end;
}

/**
 * When something set for `at` really goes out: then, or at the end of quiet
 * hours when it falls inside them. Quiet hours across midnight end in the
 * morning, so a task set for 11 PM inside 10 PM–7 AM goes at 7 AM that day.
 */
export function pushTime(at: string, quiet: Quiet | null): string {
	return inQuiet(at, quiet) ? quiet!.end : at;
}

/** Is it time to push something set for `at`, now (`time`, the keeper's wall clock): past it, and not in quiet hours? */
export function pushDue(time: string, at: string, quiet: Quiet | null): boolean {
	return time >= pushTime(at, quiet) && !inQuiet(time, quiet);
}
