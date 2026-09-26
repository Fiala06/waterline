import { describe, expect, it } from 'vitest';
import { isDate, isTime, utcToZoned, zonedToUtc } from './time';

describe('isDate / isTime', () => {
	it('accepts real dates and times only', () => {
		expect(isDate('2026-09-26')).toBe(true);
		expect(isDate('2028-02-29')).toBe(true);
		for (const bad of ['2026-02-30', '2026-13-01', '2026-13-45', '2026-9-26', '26-09-26', '']) expect(isDate(bad)).toBe(false);
		expect(isTime('00:00')).toBe(true);
		expect(isTime('23:59')).toBe(true);
		for (const bad of ['24:00', '25:00', '12:60', '8:00', '']) expect(isTime(bad)).toBe(false);
	});
});

describe('zonedToUtc', () => {
	const iso = (d: string, t: string, tz: string) => zonedToUtc(d, t, tz).toISOString();

	it('converts ordinary times', () => {
		expect(iso('2026-09-26', '08:00', 'America/New_York')).toBe('2026-09-26T12:00:00.000Z');
		expect(iso('2026-01-15', '08:00', 'America/New_York')).toBe('2026-01-15T13:00:00.000Z');
		expect(iso('2026-09-26', '08:00', 'UTC')).toBe('2026-09-26T08:00:00.000Z');
	});

	it('is right on daylight-saving change days', () => {
		expect(iso('2026-03-08', '03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
		expect(iso('2026-03-08', '06:59', 'America/New_York')).toBe('2026-03-08T10:59:00.000Z');
		expect(iso('2026-11-01', '03:00', 'America/New_York')).toBe('2026-11-01T08:00:00.000Z');
		expect(iso('2026-11-01', '05:59', 'America/New_York')).toBe('2026-11-01T10:59:00.000Z');
		expect(iso('2026-03-29', '03:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
		expect(iso('2026-10-04', '03:30', 'Australia/Sydney')).toBe('2026-10-03T16:30:00.000Z');
	});

	// whether any instant shows this wall-clock time in the zone
	const exists = (date: string, time: string, tz: string) => {
		const base = Date.parse(`${date}T${time}:00Z`);
		for (let off = -14 * 60; off <= 14 * 60; off += 15) {
			const z = utcToZoned(new Date(base - off * 60_000), tz);
			if (z.date === date && z.time === time) return true;
		}
		return false;
	};

	it('round-trips every quarter hour around the changes', () => {
		const days: [string, string][] = [
			['2026-03-08', 'America/New_York'],
			['2026-11-01', 'America/New_York'],
			['2026-03-29', 'Europe/Berlin'],
			['2026-10-25', 'Europe/Berlin'],
			['2026-04-05', 'Australia/Sydney']
		];
		for (const [date, tz] of days) {
			for (let m = 0; m < 24 * 60; m += 15) {
				const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
				if (!exists(date, time, tz)) continue; // skipped by a spring-forward
				expect(utcToZoned(zonedToUtc(date, time, tz), tz), `${date} ${time} ${tz}`).toEqual({ date, time });
			}
		}
	});

	it('gives an Invalid Date for impossible input', () => {
		for (const [d, t] of [
			['2026-13-45', '08:00'],
			['2026-02-30', '08:00'],
			['2026-09-26', '25:00']
		]) {
			expect(Number.isNaN(zonedToUtc(d, t, 'UTC').getTime())).toBe(true);
		}
	});
});
