// iCalendar (RFC 5545) for the task calendar feed (#23): all-day events,
// text escaped, lines folded at 75 octets, CRLF line ends.

export interface CalendarEvent {
	uid: string;
	/** YYYY-MM-DD: an all-day event on that date */
	date: string;
	summary: string;
	description?: string;
	url?: string;
}

/** TEXT values: backslash, semicolon, comma and newline escaped. */
export function escapeText(s: string) {
	return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** A content line folded to 75 octets, continuing with a space; never splits a character. */
const encoder = new TextEncoder();
export function fold(line: string) {
	const out: string[] = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const n = encoder.encode(ch).length;
		const limit = out.length ? 74 : 75; // continuation lines start with a space
		if (bytes + n > limit) {
			out.push(cur);
			cur = '';
			bytes = 0;
		}
		cur += ch;
		bytes += n;
	}
	out.push(cur);
	return out.join('\r\n ');
}

const dateValue = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function buildCalendar(opts: { name: string; description?: string; events: CalendarEvent[]; now?: Date }) {
	const now = opts.now ?? new Date();
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Waterline//Tasks//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(opts.name)}`,
		...(opts.description ? [`X-WR-CALDESC:${escapeText(opts.description)}`] : []),
		// how often calendar apps should check again
		'REFRESH-INTERVAL;VALUE=DURATION:PT3H',
		'X-PUBLISHED-TTL:PT3H'
	];
	for (const e of opts.events) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${e.uid}`,
			`DTSTAMP:${stamp(now)}`,
			`DTSTART;VALUE=DATE:${dateValue(e.date)}`,
			`DTEND;VALUE=DATE:${dateValue(nextDay(e.date))}`,
			`SUMMARY:${escapeText(e.summary)}`,
			...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
			...(e.url ? [`URL:${e.url}`] : []),
			'TRANSP:TRANSPARENT',
			'END:VEVENT'
		);
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}
