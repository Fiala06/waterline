// Time helpers. Instants are stored as UTC ISO strings; calendar dates
// ('YYYY-MM-DD') are always in the user's time zone.

const DAY_MS = 86_400_000;

/** A wall-clock moment picked by the user, in their time zone. null elsewhere means "now". */
export interface When {
	date: string; // YYYY-MM-DD
	time: string; // HH:MM
}

/** "Now" or "Wed, Sep 24 · 7:15 PM". */
export function whenLabel(w: When | null): string {
	if (!w) return 'Now';
	const d = new Date(w.date + 'T12:00:00Z').toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const [h, m] = w.time.split(':').map(Number);
	const t = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC'
	});
	return `${d} · ${t}`;
}

// Building an Intl.DateTimeFormat is slow and these run for every row shown,
// so each kind is made once per zone and reused.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(kind: string, locale: string, options: Intl.DateTimeFormatOptions) {
	const key = `${kind} ${options.timeZone}`;
	let fmt = formatters.get(key);
	if (!fmt) formatters.set(key, (fmt = new Intl.DateTimeFormat(locale, options)));
	return fmt;
}

/** Calendar date of an instant in a time zone, as 'YYYY-MM-DD'. */
export function dateInZone(instant: Date | string, timeZone: string): string {
	const d = typeof instant === 'string' ? new Date(instant) : instant;
	// en-CA formats as YYYY-MM-DD
	return formatter('date', 'en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

export function todayInZone(timeZone: string, now = new Date()): string {
	return dateInZone(now, timeZone);
}

/** Whole days from date a to date b (both 'YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS);
}

export function addDays(date: string, days: number): string {
	const t = Date.parse(date + 'T00:00:00Z') + days * DAY_MS;
	return new Date(t).toISOString().slice(0, 10);
}

/** "Sep 27" for a 'YYYY-MM-DD' date. */
export function fmtDate(date: string): string {
	return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

/** "Mar 8, 2025" for a 'YYYY-MM-DD' date. */
export function fmtDateLong(date: string): string {
	return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export function fmtTime(instant: string, timeZone: string): string {
	return new Date(instant).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone
	});
}

/** "Today, 8:12 AM", "Yesterday, 7:15 PM" or "Sep 17, 8:12 AM". */
export function fmtWhen(instant: string, timeZone: string, now = new Date()): string {
	const day = dateInZone(instant, timeZone);
	const diff = daysBetween(day, todayInZone(timeZone, now));
	const time = fmtTime(instant, timeZone);
	if (diff === 0) return `Today, ${time}`;
	if (diff === 1) return `Yesterday, ${time}`;
	return `${fmtDate(day)}, ${time}`;
}

/** "Logged today at 8:12 AM · edited 8:20 AM" on edit screens (G6). */
export function loggedLine(at: string, editedAt: string | null, timeZone: string, now = new Date()): string {
	const when = fmtWhen(at, timeZone, now).replace(/^(Today|Yesterday), /, (m) => `${m.slice(0, -2).toLowerCase()} at `);
	return `Logged ${when}${editedAt ? ` · edited ${fmtTime(editedAt, timeZone)}` : ''}`;
}

/** "Today", "Yesterday" or "Sep 17". */
export function fmtDay(instant: string, timeZone: string, now = new Date()): string {
	const day = dateInZone(instant, timeZone);
	const diff = daysBetween(day, todayInZone(timeZone, now));
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Yesterday';
	return fmtDate(day);
}

/** A real calendar date 'YYYY-MM-DD' (not 2026-02-30 or 2026-13-01). */
export function isDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A clock time 'HH:MM' from 00:00 to 23:59. */
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * Convert a wall-clock date + time in a time zone to a UTC instant.
 * `date` is 'YYYY-MM-DD', `time` is 'HH:MM'; anything else gives an Invalid Date.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
	if (!isDate(date) || !isTime(time)) return new Date(NaN);
	const fmt = formatter('parts', 'en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
	// The zone's offset at an instant, found by formatting it in the zone.
	const offset = (t: number) => {
		const parts = fmt.formatToParts(new Date(t));
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
		return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - t;
	};
	const wall = Date.parse(`${date}T${time}:00Z`);
	// Twice: near a daylight-saving change the offset at the first guess can be the other one.
	const first = wall - offset(wall);
	return new Date(wall - offset(first));
}

/** Wall-clock parts of an instant in a zone: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function utcToZoned(instant: string | Date, timeZone: string) {
	const d = typeof instant === 'string' ? new Date(instant) : instant;
	const time = formatter('time', 'en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(d);
	return { date: dateInZone(d, timeZone), time };
}

/**
 * One-tap times for logging after the fact (G9): an hour ago, this morning
 * (once it's past 9) and yesterday evening, in the keeper's time zone.
 */
export function quickWhens(timeZone: string, now = new Date()): { label: string; when: When }[] {
	const z = utcToZoned(now, timeZone);
	const picks = [{ label: '1 hour ago', when: utcToZoned(new Date(now.getTime() - 3_600_000), timeZone) }];
	if (z.time >= '09:00') picks.push({ label: 'This morning', when: { date: z.date, time: '08:00' } });
	picks.push({ label: 'Yesterday evening', when: { date: addDays(z.date, -1), time: '18:00' } });
	return picks;
}

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}
