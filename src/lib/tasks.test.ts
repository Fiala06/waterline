import { describe, expect, it } from 'vitest';
import { amountText, cadenceText, courseText, dueInfo, effectiveDue, endsAfterTimes, intervalText, intervalFor, logCompletes, nextDueAfterCompletion, occurrencesUntil, onOrAfterWeekday, parseWeekdays, reminderDue, reminderSub, resumeSchedule, routineLine, scheduleExamples, skipTo, snoozeOptions } from './tasks';

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
	it('uses the moved date, later or (Do it today) sooner', () => {
		expect(effectiveDue({ nextDue: '2026-09-24', snoozedUntil: '2026-09-27' })).toBe('2026-09-27');
		expect(effectiveDue({ nextDue: '2026-10-01', snoozedUntil: '2026-09-27' })).toBe('2026-09-27');
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
	it('offers tomorrow, in 2 days, this weekend and next week (#165)', () => {
		// Tue Sep 22 2026
		expect(snoozeOptions('2026-09-22', '2026-09-21')).toEqual([
			{ label: 'Tomorrow', date: '2026-09-23' },
			{ label: 'In 2 days', date: '2026-09-24' },
			{ label: 'This weekend', date: '2026-09-26' },
			{ label: 'Next week', date: '2026-09-29' }
		]);
	});

	it('never offers the same day twice', () => {
		// Thu Sep 24 2026: in 2 days is Saturday
		expect(snoozeOptions('2026-09-24', '2026-09-24').map((o) => o.label)).toEqual(['Tomorrow', 'In 2 days', 'Next week']);
		for (let d = 0; d < 7; d++) {
			const today = `2026-10-0${d + 1}`;
			const dates = snoozeOptions(today, '2026-09-01').map((o) => o.date);
			expect(new Set(dates).size, today).toBe(dates.length);
			expect(dates.every((x) => x > today)).toBe(true);
		}
	});

	it('pushes back from the due date when it is not due yet', () => {
		expect(snoozeOptions('2026-09-25', '2026-10-07').map((o) => o.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-14']);
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

describe('logCompletes (#163)', () => {
	const every3 = { recurring: true, intervalDays: 3, scheduleMode: 'completion' as const, nextDue: '2026-10-04' };
	it('counts a water change a day early, on the day, or late', () => {
		expect(logCompletes(every3, '2026-10-01', '2026-10-03')).toBe(true);
		expect(logCompletes(every3, '2026-10-01', '2026-10-04')).toBe(true);
		expect(logCompletes(every3, '2026-10-01', '2026-10-07')).toBe(true);
	});
	it('takes an earlier one as extra, and leaves the schedule', () => {
		expect(logCompletes(every3, '2026-10-01', '2026-10-02')).toBe(false);
		// a weekly one: up to 3 days early
		expect(logCompletes(weekly, null, '2026-09-21')).toBe(true);
		expect(logCompletes(weekly, null, '2026-09-20')).toBe(false);
	});
	it('never counts an entry from before it was last done', () => {
		expect(logCompletes(every3, '2026-10-03', '2026-10-03')).toBe(false);
		expect(logCompletes(every3, '2026-10-03', '2026-10-02')).toBe(false);
	});
	it('goes by the snoozed date', () => {
		expect(logCompletes({ ...every3, snoozedUntil: '2026-10-08' }, '2026-10-01', '2026-10-04')).toBe(false);
		expect(logCompletes({ ...every3, snoozedUntil: '2026-10-08' }, '2026-10-01', '2026-10-07')).toBe(true);
	});
	it('allows a day early on set days', () => {
		const days = { recurring: true, intervalDays: null, scheduleMode: 'weekdays' as const, nextDue: '2026-10-07', weekdays: '3' };
		expect(logCompletes(days, null, '2026-10-06')).toBe(true);
		expect(logCompletes(days, null, '2026-10-05')).toBe(false);
	});
});

describe('reminderSub (#163)', () => {
	const every3 = { recurring: true, intervalDays: 3, scheduleMode: 'completion' as const, nextDue: '2026-10-04' };
	it('counts what comes next from the entry\'s day', () => {
		expect(reminderSub(every3, '2026-10-03', '2026-10-03')).toBe('Not due until Oct 4 · next would be Oct 6');
		expect(reminderSub(every3, '2026-10-02', '2026-10-05')).toBe('1 day overdue · next Oct 5');
	});
});

describe('cadenceText (#164)', () => {
	it('says how it repeats and when it was last done', () => {
		expect(cadenceText({ ...weekly, intervalDays: 3 }, '2026-10-13')).toBe('every 3 days after done · last Oct 13');
		expect(cadenceText({ ...weekly, scheduleMode: 'fixed' })).toBe('every 7 days · on schedule');
		expect(cadenceText({ recurring: true, intervalDays: null, scheduleMode: 'weekdays', nextDue: '2026-10-14', weekdays: '1,3,5' }, '2026-10-14')).toBe('Mon, Wed, Fri · last Oct 14');
		expect(cadenceText({ recurring: false, intervalDays: null, scheduleMode: 'completion', nextDue: '2026-10-14' })).toBe('one-off');
	});
	it('keeps a course and the setup review as they read', () => {
		expect(cadenceText({ ...weekly, intervalDays: 2, nextDue: '2026-10-01', endsOn: '2026-10-05' })).toBe('every 2 days after done · 3 times left · ends Oct 5');
		expect(cadenceText({ ...weekly, intervalDays: 91, kind: 'review' })).not.toMatch(/after done/);
	});
});

describe('a cadence for a while (#171)', () => {
	const outbreak = { ...weekly, nextDue: '2026-10-10', tempIntervalDays: 3, tempUntil: '2026-10-30' };
	it('counts from the tighter one until its day, then the usual', () => {
		expect(intervalFor(outbreak, '2026-10-29')).toBe(3);
		expect(intervalFor(outbreak, '2026-10-30')).toBe(7);
		expect(nextDueAfterCompletion(outbreak, '2026-10-10', '2026-10-10')).toBe('2026-10-13');
		expect(nextDueAfterCompletion(outbreak, '2026-10-31', '2026-10-31')).toBe('2026-11-07');
		const fixed = { ...outbreak, scheduleMode: 'fixed' as const };
		expect(nextDueAfterCompletion(fixed, '2026-10-10', '2026-10-10')).toBe('2026-10-13');
	});
	it('says so on the row while it lasts', () => {
		expect(cadenceText(outbreak, '2026-10-10', '2026-10-12')).toBe('every 3 days until Oct 30 · then every 7 days · last Oct 10');
		expect(cadenceText(outbreak, null, '2026-10-30')).toBe('every 7 days after done');
	});
});

describe('resumeSchedule (#172)', () => {
	it('moves a task due during the pause on by the days paused, never before the resume day', () => {
		// paused Oct 16–20 (4 days), due Oct 18 → Oct 22
		expect(resumeSchedule({ ...weekly, nextDue: '2026-10-18' }, '2026-10-16', '2026-10-20')).toEqual({ nextDue: '2026-10-22', snoozedUntil: null, endsOn: null });
		// overdue from before the pause: to the resume day at least
		expect(resumeSchedule({ ...weekly, nextDue: '2026-10-01' }, '2026-10-16', '2026-10-20').nextDue).toBe('2026-10-20');
	});
	it('leaves one due after the pause alone, and lengthens a course', () => {
		expect(resumeSchedule({ ...weekly, nextDue: '2026-10-25', endsOn: '2026-11-01' }, '2026-10-16', '2026-10-20')).toEqual({ nextDue: '2026-10-25', snoozedUntil: null, endsOn: '2026-11-05' });
	});
	it('keeps a fixed or set-days task on its schedule', () => {
		expect(resumeSchedule({ ...weekly, scheduleMode: 'fixed', nextDue: '2026-10-17' }, '2026-10-16', '2026-10-20').nextDue).toBe('2026-10-24');
		// Wednesdays: the first one on or after Tue Oct 20 is Oct 21
		expect(resumeSchedule({ recurring: true, intervalDays: null, scheduleMode: 'weekdays', weekdays: '3', nextDue: '2026-10-14' }, '2026-10-13', '2026-10-20').nextDue).toBe('2026-10-21');
	});
});
