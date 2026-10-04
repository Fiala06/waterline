import { describe, expect, it } from 'vitest';
import { amountText, courseText, dueInfo, effectiveDue, endsAfterTimes, intervalText, nextDueAfterCompletion, occurrencesUntil, onOrAfterWeekday, parseWeekdays, reminderDue, routineLine, scheduleExamples, skipTo, snoozeOptions } from './tasks';

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

	it('stops at the end of a course', () => {
		// every 2 days from Oct 1, ending Oct 9: Oct 1, 3, 5, 7, 9
		const course = { recurring: true, intervalDays: 2, scheduleMode: 'completion' as const, nextDue: '2026-10-01', endsOn: '2026-10-09' };
		expect(nextDueAfterCompletion(course, '2026-10-01', '2026-10-01')).toBe('2026-10-03');
		expect(nextDueAfterCompletion({ ...course, nextDue: '2026-10-07' }, '2026-10-07', '2026-10-07')).toBe('2026-10-09');
		// the last dose: done, nothing more is due
		expect(nextDueAfterCompletion({ ...course, nextDue: '2026-10-09' }, '2026-10-09', '2026-10-09')).toBeNull();
		// done late, after the end: over
		expect(nextDueAfterCompletion({ ...course, nextDue: '2026-10-09' }, '2026-10-12', '2026-10-12')).toBeNull();
		// a fixed schedule that would step past the end
		expect(nextDueAfterCompletion({ ...course, scheduleMode: 'fixed', nextDue: '2026-10-07' }, '2026-10-10', '2026-10-10')).toBeNull();
		// on set days: Mon, Wed, Fri until Fri Oct 9
		const days = { recurring: true, intervalDays: null, scheduleMode: 'weekdays' as const, weekdays: '1,3,5', nextDue: '2026-10-07', endsOn: '2026-10-09' };
		expect(nextDueAfterCompletion(days, '2026-10-07', '2026-10-07')).toBe('2026-10-09');
		expect(nextDueAfterCompletion({ ...days, nextDue: '2026-10-09' }, '2026-10-09', '2026-10-09')).toBeNull();
		// no end: as before
		expect(nextDueAfterCompletion({ ...course, endsOn: null, nextDue: '2026-10-09' }, '2026-10-09', '2026-10-09')).toBe('2026-10-11');
	});
});

describe('a course with an end', () => {
	const course = { recurring: true, intervalDays: 2, scheduleMode: 'completion' as const, nextDue: '2026-10-01', endsOn: '2026-10-09', kind: 'dosing' };

	it('lists the days left', () => {
		expect(occurrencesUntil(course, '2026-10-09')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09']);
		expect(occurrencesUntil({ ...course, nextDue: '2026-10-10' }, '2026-10-09')).toEqual([]);
		expect(occurrencesUntil({ ...course, scheduleMode: 'weekdays', weekdays: '1,3,5', nextDue: '2026-10-06' }, '2026-10-12')).toEqual(['2026-10-07', '2026-10-09', '2026-10-12']);
		expect(occurrencesUntil({ ...course, recurring: false }, '2026-10-09')).toEqual(['2026-10-01']);
	});

	it('turns "N times" into the last day', () => {
		expect(endsAfterTimes(course, 1)).toBe('2026-10-01');
		expect(endsAfterTimes(course, 5)).toBe('2026-10-09');
		expect(endsAfterTimes({ ...course, scheduleMode: 'weekdays', weekdays: '1,3,5', nextDue: '2026-10-06' }, 3)).toBe('2026-10-12');
		expect(endsAfterTimes(course, 0)).toBeNull();
		expect(endsAfterTimes({ ...course, nextDue: null }, 3)).toBeNull();
	});

	it('says what is left', () => {
		expect(courseText(course)).toBe('5 doses left · ends Oct 9');
		expect(courseText({ ...course, nextDue: '2026-10-09' })).toBe('1 dose left · ends Oct 9');
		expect(courseText({ ...course, kind: 'feeding', nextDue: '2026-10-07' })).toBe('2 feedings left · ends Oct 9');
		expect(courseText({ ...course, kind: 'maintenance' })).toBe('5 times left · ends Oct 9');
		expect(courseText({ ...course, endsOn: null })).toBeNull();
		expect(intervalText(course)).toBe('every 2 days · 5 doses left · ends Oct 9');
		expect(routineLine({ ...course, amount: 1, amountUnit: 'g' })).toBe('1 g · every 2 days · 5 doses left · ends Oct 9');
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

	it('never offers the same day twice: on a Wednesday, next weekend is the one after this Saturday', () => {
		// Wed Sep 30 2026: in 3 days is Saturday Oct 3
		expect(snoozeOptions('2026-09-30', '2026-09-28')).toEqual([
			{ label: 'Tomorrow', date: '2026-10-01' },
			{ label: 'In 3 days', date: '2026-10-03' },
			{ label: 'Next weekend', date: '2026-10-10' }
		]);
		for (let d = 0; d < 7; d++) {
			const today = `2026-10-0${d + 1}`;
			const dates = snoozeOptions(today, '2026-09-01').map((o) => o.date);
			expect(new Set(dates).size, today).toBe(3);
		}
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

// 2026-09-28 is a Monday
describe('on set days of the week (#17)', () => {
	const mwf = { recurring: true, intervalDays: null, scheduleMode: 'weekdays' as const, weekdays: '1,3,5', nextDue: '2026-09-28' };

	it('moves to the next day picked', () => {
		expect(nextDueAfterCompletion(mwf, '2026-09-28', '2026-09-28')).toBe('2026-09-30');
		expect(nextDueAfterCompletion({ ...mwf, nextDue: '2026-10-02' }, '2026-10-02', '2026-10-02')).toBe('2026-10-05');
	});

	it("done late: the next day picked after today; done early: Wednesday's dose doesn't come back", () => {
		expect(nextDueAfterCompletion(mwf, '2026-09-29', '2026-09-29')).toBe('2026-09-30');
		expect(nextDueAfterCompletion({ ...mwf, nextDue: '2026-09-30' }, '2026-09-28', '2026-09-28')).toBe('2026-10-02');
	});

	it('every day, and a lone Sunday', () => {
		expect(nextDueAfterCompletion({ ...mwf, weekdays: '0,1,2,3,4,5,6' }, '2026-09-28', '2026-09-28')).toBe('2026-09-29');
		expect(nextDueAfterCompletion({ ...mwf, weekdays: '0' }, '2026-09-28', '2026-09-28')).toBe('2026-10-04');
	});

	it('the first day picked on or after a date', () => {
		expect(onOrAfterWeekday('2026-09-29', [1, 3, 5])).toBe('2026-09-30');
		expect(onOrAfterWeekday('2026-09-28', [1])).toBe('2026-09-28');
	});

	it('reads days as written, and drops anything else', () => {
		expect(parseWeekdays('5,1,3,3,9,x')).toEqual([1, 3, 5]);
		expect(parseWeekdays(null)).toEqual([]);
	});

	it('says which days', () => {
		expect(intervalText(mwf)).toBe('Mon, Wed, Fri');
		expect(intervalText({ ...mwf, weekdays: '0,1,2,3,4,5,6' })).toBe('every day');
		expect(intervalText({ ...mwf, weekdays: '1,2,3,4,5,6' })).toBe('every day but Sun');
		expect(intervalText({ ...mwf, weekdays: '1,2,3,4,5' })).toBe('Mon–Fri');
		expect(intervalText({ ...mwf, weekdays: '6,0' })).toBe('Sat, Sun');
	});
});

describe('a routine’s amount', () => {
	it('one pump, two pumps, 1.5 mL', () => {
		expect(amountText(1, 'pumps')).toBe('1 pump');
		expect(amountText(2, 'pumps')).toBe('2 pumps');
		expect(amountText(1.5, 'mL')).toBe('1.5 mL');
		expect(amountText(1, 'pinches')).toBe('1 pinch');
		expect(amountText(3, null)).toBe('3');
		expect(amountText(null, 'mL')).toBeNull();
	});

	it('its line: how much, then when', () => {
		expect(routineLine({ kind: 'dosing', amount: 1, amountUnit: 'pumps', recurring: true, intervalDays: null, scheduleMode: 'weekdays', weekdays: '1,3,5' })).toBe('1 pump · Mon, Wed, Fri');
		expect(routineLine({ kind: 'feeding', amount: null, amountUnit: null, recurring: true, intervalDays: 1, scheduleMode: 'completion' })).toBe('every day');
	});
});

describe('skipTo (#71)', () => {
	const base = { recurring: true, intervalDays: 7, scheduleMode: 'completion' as const, nextDue: '2026-10-02' };
	it('moves to the next occurrence after the one due', () => {
		expect(skipTo(base, '2026-10-04')).toBe('2026-10-09');
		// not due yet: the one after it
		expect(skipTo({ ...base, nextDue: '2026-10-06' }, '2026-10-04')).toBe('2026-10-13');
	});
	it('steps on past today when far overdue', () => {
		expect(skipTo({ ...base, nextDue: '2026-09-01' }, '2026-10-04')).toBe('2026-10-06');
		expect(skipTo({ ...base, scheduleMode: 'fixed', nextDue: '2026-09-01' }, '2026-10-04')).toBe('2026-10-06');
	});
	it('goes to the next set day', () => {
		// Mon and Thu; Oct 5 2026 is a Monday
		expect(skipTo({ ...base, scheduleMode: 'weekdays', weekdays: '1,4', nextDue: '2026-10-05' }, '2026-10-04')).toBe('2026-10-08');
	});
	it('has nothing to skip to for a one-off or the last of a course', () => {
		expect(skipTo({ ...base, recurring: false }, '2026-10-04')).toBeNull();
		expect(skipTo({ ...base, endsOn: '2026-10-05' }, '2026-10-04')).toBeNull();
	});
});
