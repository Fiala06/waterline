import { describe, expect, it } from 'vitest';
import { inQuiet, lightTimes, parseRemindAt, pushDue, pushTime, quietOf, remindAtText, remindTime } from './remind-time';

describe('a task’s time of day (#180)', () => {
	const lights = { on: '10:00', off: '18:00' };

	it('is stored from the form as a choice, a time or nothing', () => {
		expect(parseRemindAt('before_lights', '')).toBe('before_lights');
		expect(parseRemindAt('lights_off', null)).toBe('lights_off');
		expect(parseRemindAt('time', '21:30')).toBe('21:30');
		expect(parseRemindAt('time', '25:00')).toBeNull();
		expect(parseRemindAt('time', '')).toBeNull();
		expect(parseRemindAt('send', '21:30')).toBeNull();
		expect(parseRemindAt(undefined, undefined)).toBeNull();
	});

	it('reads as words', () => {
		expect(remindAtText(null)).toBeNull();
		expect(remindAtText('before_lights')).toBe('Before lights on');
		expect(remindAtText('lights_off')).toBe('At lights off');
		expect(remindAtText('21:05')).toBe('At 9:05 PM');
		expect(remindAtText('00:30')).toBe('At 12:30 AM');
		expect(remindAtText('12:00')).toBe('At 12:00 PM');
	});

	it('takes the first lights-on and the last lights-off of a split schedule', () => {
		expect(lightTimes({ periods: [{ on: '08:00', off: '12:00' }, { on: '14:00', off: '18:30' }] })).toEqual({ on: '08:00', off: '18:30' });
		expect(lightTimes({ periods: [] })).toBeNull();
		expect(lightTimes(null)).toBeNull();
	});

	it('is pushed at its own time, around the lights, or at the send time', () => {
		expect(remindTime(null, '08:00', lights)).toBe('08:00');
		expect(remindTime('before_lights', '08:00', lights)).toBe('09:30');
		expect(remindTime('lights_off', '08:00', lights)).toBe('18:00');
		expect(remindTime('21:15', '08:00', lights)).toBe('21:15');
		// lights on just after midnight: 30 minutes before is late on the task's day
		expect(remindTime('before_lights', '08:00', { on: '00:15', off: '08:00' })).toBe('23:45');
	});

	it('falls back to the send time when the tank has no light schedule', () => {
		expect(remindTime('before_lights', '08:00', null)).toBe('08:00');
		expect(remindTime('lights_off', '07:30', null)).toBe('07:30');
	});

	it('is never later than the scheduler’s last run of the day', () => {
		expect(remindTime('23:59', '08:00', null)).toBe('23:50');
		expect(remindTime(null, '23:55', null)).toBe('23:50');
	});
});

describe('quiet hours (#180)', () => {
	const night = quietOf('22:00', '07:00');
	const lunch = quietOf('12:00', '13:30');

	it('need both times, and different ones', () => {
		expect(quietOf('22:00', null)).toBeNull();
		expect(quietOf('22:00', '22:00')).toBeNull();
		expect(quietOf('', '')).toBeNull();
		expect(quietOf('9pm', '07:00')).toBeNull();
	});

	it('cover the night across midnight, the end not included', () => {
		expect(inQuiet('22:00', night)).toBe(true);
		expect(inQuiet('23:59', night)).toBe(true);
		expect(inQuiet('03:00', night)).toBe(true);
		expect(inQuiet('06:59', night)).toBe(true);
		expect(inQuiet('07:00', night)).toBe(false);
		expect(inQuiet('21:59', night)).toBe(false);
		expect(inQuiet('12:30', lunch)).toBe(true);
		expect(inQuiet('13:30', lunch)).toBe(false);
		expect(inQuiet('03:00', null)).toBe(false);
	});

	it('hold back what falls inside them until they end', () => {
		expect(pushTime('08:00', night)).toBe('08:00');
		expect(pushTime('05:30', night)).toBe('07:00');
		expect(pushTime('23:00', night)).toBe('07:00');
		expect(pushTime('12:15', lunch)).toBe('13:30');
	});

	it('push once the time has come and quiet hours are over', () => {
		// a dose before lights-on at 05:30, inside 22:00–07:00: not until 07:00
		expect(pushDue('05:30', '05:30', night)).toBe(false);
		expect(pushDue('06:55', '05:30', night)).toBe(false);
		expect(pushDue('07:00', '05:30', night)).toBe(true);
		// an evening feeding at 22:30 goes at 07:00 that morning, not in the night
		expect(pushDue('07:05', '22:30', night)).toBe(true);
		expect(pushDue('22:30', '22:30', night)).toBe(false);
		// outside quiet hours, from its time on
		expect(pushDue('07:55', '08:00', night)).toBe(false);
		expect(pushDue('08:00', '08:00', night)).toBe(true);
		expect(pushDue('12:45', '12:15', lunch)).toBe(false);
		expect(pushDue('13:30', '12:15', lunch)).toBe(true);
		expect(pushDue('08:00', '08:00', null)).toBe(true);
	});
});
