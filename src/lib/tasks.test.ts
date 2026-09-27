import { describe, expect, it } from 'vitest';
import { dueInfo, effectiveDue, intervalText, nextDueAfterCompletion, reminderDue, scheduleExamples, snoozeOptions } from './tasks';

const weekly = { recurring: true, intervalDays: 7, scheduleMode: 'completion' as const, nextDue: '2026-09-24' };

describe('nextDueAfterCompletion', () => {
	it('counts from the completion day', () => {
		expect(nextDueAfterCompletion(weekly, '2026-09-26', '2026-09-26')).toBe('2026-10-03');
	});

	it('stays on the calendar for fixed schedules', () => {
		const fixed = { ...weekly, scheduleMode: 'fixed' as const };
		expect(nextDueAfterCompletion(fixed, '2026-09-26', '2026-09-26')).toBe('2026-10-01');
		// done very late: skips to the next slot after today
		expect(nextDueAfterCompletion(fixed, '2026-10-09', '2026-10-09')).toBe('2026-10-15');
	});

	it('closes one-off tasks', () => {
		expect(nextDueAfterCompletion({ ...weekly, recurring: false }, '2026-09-26', '2026-09-26')).toBeNull();
	});
});

describe('effectiveDue', () => {
	it('uses the snooze only when it is later than the schedule', () => {
		expect(effectiveDue({ nextDue: '2026-09-24', snoozedUntil: '2026-09-27' })).toBe('2026-09-27');
		expect(effectiveDue({ nextDue: '2026-10-01', snoozedUntil: '2026-09-27' })).toBe('2026-10-01');
		expect(effectiveDue({ nextDue: '2026-09-24', snoozedUntil: null })).toBe('2026-09-24');
		expect(effectiveDue({ nextDue: null, snoozedUntil: '2026-09-27' })).toBeNull();
	});
});

describe('dueInfo', () => {
	it('labels overdue, today, soon and later', () => {
		expect(dueInfo('2026-09-24', '2026-09-25')).toMatchObject({ level: 'bad', text: '✕ Overdue 1 day', section: 'overdue' });
		expect(dueInfo('2026-09-22', '2026-09-25').text).toBe('✕ Overdue 3 days');
		expect(dueInfo('2026-09-25', '2026-09-25')).toMatchObject({ level: 'warn', text: '▲ Due today', section: 'soon' });
		expect(dueInfo('2026-09-27', '2026-09-25')).toMatchObject({ text: '▲ Due in 2 days · Sep 27', section: 'soon' });
		expect(dueInfo('2026-10-03', '2026-09-25')).toMatchObject({ level: 'ok', text: 'Oct 3', section: 'later' });
	});
});

describe('snoozeOptions', () => {
	it('offers tomorrow, in 3 days and next weekend', () => {
		// Fri Sep 25 2026
		expect(snoozeOptions('2026-09-25', '2026-09-24')).toEqual([
			{ label: 'Tomorrow', date: '2026-09-26' },
			{ label: 'In 3 days', date: '2026-09-28' },
			{ label: 'Next weekend', date: '2026-10-03' }
		]);
	});

	it('pushes back from the due date when it is not due yet', () => {
		expect(snoozeOptions('2026-09-25', '2026-10-07').map((o) => o.date)).toEqual(['2026-10-08', '2026-10-10', '2026-10-14']);
	});
});

describe('text', () => {
	it('describes intervals and schedules', () => {
		expect(intervalText({ recurring: true, intervalDays: 7 })).toBe('every 7 days');
		expect(intervalText({ recurring: true, intervalDays: 28 })).toBe('every 4 weeks');
		expect(intervalText({ recurring: false, intervalDays: null })).toBe('one-off');
		const ex = scheduleExamples('2026-09-25', 7);
		expect(ex.completion).toBe('Done late on Sep 26 → next due Oct 3');
		expect(ex.fixed).toBe("Always every Friday, whenever it's done");
	});
});

describe('reminderDue', () => {
	const today = '2026-09-27';
	it('counts days from today, in one tap', () => {
		expect(reminderDue('1', '', today)).toBe('2026-09-28');
		expect(reminderDue('7', '', today)).toBe('2026-10-04');
		expect(reminderDue('14', '', today)).toBe('2026-10-11');
	});
	it('takes a date after today', () => {
		expect(reminderDue('date', '2026-12-01', today)).toBe('2026-12-01');
		expect(reminderDue('date', today, today)).toBeNull();
		expect(reminderDue('date', '2026-02-30', today)).toBeNull();
	});
	it('refuses anything else', () => {
		expect(reminderDue('5', '', today)).toBeNull();
		expect(reminderDue('', '', today)).toBeNull();
	});
});
