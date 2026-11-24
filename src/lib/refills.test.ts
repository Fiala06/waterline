import { describe, expect, it } from 'vitest';
import { fillText, lastsText, lowLeadDays, refillDue, refillLine, refillStats } from './refills';

// CO₂ cylinder refills (#368): how long a fill lasts, from the days it was refilled.
describe('how long a fill lasts (#368)', () => {
	it('has nothing to say until a refill is logged, and no length until the second', () => {
		expect(refillStats([])).toEqual({ count: 0, last: null, avgDays: null, fills: 0, expected: null });
		expect(refillLine(refillStats([]))).toBeNull();
		const one = refillStats(['2026-11-24']);
		expect(one).toMatchObject({ count: 1, last: '2026-11-24', avgDays: null, expected: null });
		expect(refillLine(one)).toBe('Last refilled Nov 24');
		expect(refillDue(one, '2027-06-01')).toBeNull();
	});

	it('averages the gaps between refills, in any order, a day counted once', () => {
		const s = refillStats(['2026-07-01', '2026-03-01', '2026-11-24', '2026-07-01']);
		// 122 and 146 days
		expect(s).toMatchObject({ count: 3, last: '2026-11-24', avgDays: 134, fills: 2, expected: '2027-04-07' });
		expect(refillLine(s)).toBe('Last refilled Nov 24 · a fill lasts about 4 months (average of 2)');
	});

	it('says the last fill when only one is measured', () => {
		expect(fillText(refillStats(['2026-08-01', '2026-11-24']))).toBe('the last fill lasted about 4 months');
	});

	it('follows the latest five fills, so a changed bubble rate shows', () => {
		const days = ['2025-01-01', '2025-07-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];
		expect(refillStats(days)).toMatchObject({ fills: 5, avgDays: 30, expected: '2026-07-01' });
	});

	it('words a length in days, weeks or months', () => {
		expect(lastsText(1)).toBe('about 1 day');
		expect(lastsText(12)).toBe('about 12 days');
		expect(lastsText(14)).toBe('about 2 weeks');
		expect(lastsText(45)).toBe('about 6 weeks');
		expect(lastsText(61)).toBe('about 2 months');
		expect(lastsText(120)).toBe('about 4 months');
	});

	it('is likely running low two weeks before a fill usually runs out, sooner for a short fill', () => {
		expect(lowLeadDays(120)).toBe(14);
		expect(lowLeadDays(20)).toBe(5);
		expect(lowLeadDays(3)).toBe(2);
		const s = refillStats(['2026-07-27', '2026-11-24']); // 120 days: expected Mar 24
		expect(refillDue(s, '2027-03-09')).toEqual({ low: false, level: 'ok', text: '✓ Next refill around Mar 24' });
		expect(refillDue(s, '2027-03-10')).toMatchObject({ low: true, level: 'warn', text: '▲ Likely running low · a fill usually lasts until about Mar 24' });
		// still low once the day has passed, until the next refill is logged
		expect(refillDue(s, '2027-05-01')?.low).toBe(true);
	});
});
