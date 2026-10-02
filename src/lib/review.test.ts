import { describe, expect, it } from 'vitest';
import { newReviewTask, parseReviewEvery, reviewEvery, reviewTitle, sectionChecked, serviceFlag } from './review';
import { intervalText } from './tasks';

describe('how often the setup review comes up', () => {
	it('is every 3 months for a new tank, first due 3 months on', () => {
		expect(newReviewTask('t1', '2026-10-02')).toMatchObject({ kind: 'review', name: 'Review tank setup', intervalDays: 91, nextDue: '2027-01-01' });
		expect(newReviewTask('t1', '2026-10-02', 30).nextDue).toBe('2026-11-01');
	});

	it('reads in months', () => {
		expect(reviewEvery(91)).toBe('every 3 months');
		expect(reviewEvery(30)).toBe('every month');
		expect(reviewEvery(182)).toBe('every 6 months');
		expect(reviewEvery(60)).toBeNull();
		expect(intervalText({ kind: 'review', recurring: true, intervalDays: 91 })).toBe('every 3 months');
		// edited in Tasks to something else: it says the days
		expect(intervalText({ kind: 'review', recurring: true, intervalDays: 60 })).toBe('every 60 days');
		// other tasks are untouched
		expect(intervalText({ kind: 'maintenance', recurring: true, intervalDays: 91 })).toBe('every 13 weeks');
	});

	it('takes one of its own intervals, or off, from Tank settings', () => {
		expect(parseReviewEvery('91')).toBe(91);
		expect(parseReviewEvery('off')).toBe('off');
		expect(parseReviewEvery('60')).toBeNull(); // a custom interval is left as it is
		expect(parseReviewEvery(null)).toBeNull();
	});
});

describe('a part of the setup checked', () => {
	it('counts when it was checked after the last review', () => {
		const checks = { details: '2026-10-02T10:00:00Z', targets: '2026-06-01T10:00:00Z' };
		expect(sectionChecked(checks, 'details', '2026-07-01T10:00:00Z')).toBe(true);
		expect(sectionChecked(checks, 'targets', '2026-07-01T10:00:00Z')).toBe(false);
		expect(sectionChecked(checks, 'equipment', '2026-07-01T10:00:00Z')).toBe(false);
		// no review finished yet: checked at all is checked
		expect(sectionChecked(checks, 'targets', null)).toBe(true);
		expect(sectionChecked({}, 'details', null)).toBe(false);
	});
});

describe('equipment that wants servicing', () => {
	const fmt = (d: string) => d;
	const today = '2026-10-02';
	it('flags a filter not serviced in 6 months, or never once it has been in a while', () => {
		expect(serviceFlag({ type: 'filter', installedAt: '2025-01-01', lastServicedAt: '2026-03-01T09:00:00Z' }, today, fmt)).toBe('▲ Not serviced since 2026-03-01');
		expect(serviceFlag({ type: 'filter', installedAt: '2025-01-01', lastServicedAt: '2026-09-01T09:00:00Z' }, today, fmt)).toBeNull();
		expect(serviceFlag({ type: 'pump', installedAt: '2025-01-01', lastServicedAt: null }, today, fmt)).toBe('▲ No service logged');
		expect(serviceFlag({ type: 'pump', installedAt: null, lastServicedAt: null }, today, fmt)).toBe('▲ No service logged');
		// just installed: nothing to say yet
		expect(serviceFlag({ type: 'co2', installedAt: '2026-08-01', lastServicedAt: null }, today, fmt)).toBeNull();
	});
	it("leaves lights and heaters alone: they aren't serviced", () => {
		expect(serviceFlag({ type: 'light', installedAt: '2020-01-01', lastServicedAt: null }, today, fmt)).toBeNull();
		expect(serviceFlag({ type: 'heater', installedAt: '2020-01-01', lastServicedAt: null }, today, fmt)).toBeNull();
	});
});

describe("the review's History entry", () => {
	it('says what had changed', () => {
		expect(reviewTitle({ changed: [] })).toBe('Reviewed tank setup · all still right');
		expect(reviewTitle({})).toBe('Reviewed tank setup · all still right');
		expect(reviewTitle({ changed: ['livestock'] })).toBe('Reviewed tank setup · livestock & plants changed');
		expect(reviewTitle({ changed: ['livestock', 'equipment', 'nonsense'] })).toBe('Reviewed tank setup · equipment and livestock & plants changed');
	});
});
