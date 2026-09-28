import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, fold } from './ics';

describe('escapeText', () => {
	it('escapes what iCalendar text treats specially', () => {
		expect(escapeText('Water change; 25%, RODI\nnote \\ here')).toBe('Water change\; 25%\\, RODI\\nnote \\\\ here');
	});
});

describe('fold', () => {
	it('keeps short lines, and folds long ones at 75 octets', () => {
		expect(fold('SUMMARY:short')).toBe('SUMMARY:short');
		const long = `DESCRIPTION:${'a'.repeat(200)}`;
		const lines = fold(long).split('\r\n');
		expect(lines[0]).toHaveLength(75);
		for (const l of lines.slice(1)) {
			expect(l.startsWith(' ')).toBe(true);
			expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
		}
		expect(lines.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
	});
	it('never splits a character that takes several bytes', () => {
		const long = `SUMMARY:${'°C · CO₂ '.repeat(20)}`;
		const lines = fold(long).split('\r\n');
		for (const l of lines) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
		expect(lines.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
	});
});

describe('buildCalendar', () => {
	const ics = buildCalendar({
		name: 'Waterline tasks',
		events: [{ uid: 't1@waterline', date: '2026-09-30', summary: 'Water change 25% · Riverbed 40', description: 'Every 7 days', url: 'https://t.example/tasks' }],
		now: new Date('2026-09-28T12:34:56.789Z')
	});
	it('is a calendar of all-day events with CRLF line ends', () => {
		expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(ics).not.toMatch(/[^\r]\n/);
		expect(ics).toContain('DTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261001');
		expect(ics).toContain('DTSTAMP:20260928T123456Z');
		expect(ics).toContain('UID:t1@waterline');
		expect(ics).toContain('SUMMARY:Water change 25% · Riverbed 40');
	});
	it('ends an event on the next day across a month and a year', () => {
		const y = buildCalendar({ name: 'x', events: [{ uid: 'u', date: '2026-12-31', summary: 's' }] });
		expect(y).toContain('DTEND;VALUE=DATE:20270101');
	});
});
