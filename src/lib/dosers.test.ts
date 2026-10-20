import { describe, expect, it } from 'vitest';
import { doseDue, doseLabel, dosesLabel, doseMarks, isDoseDay, nextDoseText, startFrom, type DoseSpec } from './dosers';

const thrive: DoseSpec = { product: 'Thrive+', amountMl: 1, at: '10:00', seconds: 30, weekdays: null, paused: false };
const mwf: DoseSpec = { ...thrive, product: 'Excel', amountMl: 2.5, seconds: null, weekdays: '1,3,5' };

describe("a doser's doses (#196)", () => {
	it('writes the dose in words', () => {
		expect(doseLabel(thrive)).toBe('Thrive+ 1 mL at 10:00 every day · runs 30 s');
		expect(doseLabel(mwf)).toBe('Excel 2.5 mL at 10:00 Mon, Wed, Fri');
		expect(doseLabel({ ...mwf, weekdays: '1,2,3,4,5', paused: true })).toBe('Excel 2.5 mL at 10:00 Mon–Fri · paused');
		// every day written out is every day
		expect(doseLabel({ ...thrive, weekdays: '0,1,2,3,4,5,6', seconds: null })).toBe('Thrive+ 1 mL at 10:00 every day');
		expect(dosesLabel([thrive, mwf])).toBe('Thrive+ 1 mL at 10:00 every day · runs 30 s; Excel 2.5 mL at 10:00 Mon, Wed, Fri');
		expect(dosesLabel([])).toBe('nothing');
	});

	it('knows its days', () => {
		// 2026-10-19 is a Monday
		expect(isDoseDay(thrive, '2026-10-19')).toBe(true);
		expect(isDoseDay(mwf, '2026-10-19')).toBe(true);
		expect(isDoseDay(mwf, '2026-10-20')).toBe(false);
		expect(isDoseDay(mwf, '2026-10-21')).toBe(true);
	});

	it('is due once its time comes, once a day, on its days, unless paused', () => {
		const d = { ...thrive, lastLoggedOn: '2026-10-18' };
		expect(doseDue(d, { date: '2026-10-19', time: '09:55' })).toBe(false);
		expect(doseDue(d, { date: '2026-10-19', time: '10:00' })).toBe(true);
		expect(doseDue(d, { date: '2026-10-19', time: '15:30' })).toBe(true);
		expect(doseDue({ ...d, lastLoggedOn: '2026-10-19' }, { date: '2026-10-19', time: '15:30' })).toBe(false);
		expect(doseDue({ ...d, lastLoggedOn: null }, { date: '2026-10-19', time: '10:00' })).toBe(true);
		expect(doseDue({ ...d, paused: true }, { date: '2026-10-19', time: '10:00' })).toBe(false);
		// not a Tuesday
		expect(doseDue({ ...mwf, lastLoggedOn: null }, { date: '2026-10-20', time: '12:00' })).toBe(false);
		expect(doseDue({ ...mwf, lastLoggedOn: null }, { date: '2026-10-21', time: '12:00' })).toBe(true);
	});

	it('starts from the next time: a dose set up after its time is not logged for today', () => {
		expect(startFrom(thrive, { date: '2026-10-19', time: '15:00' }, null)).toBe('2026-10-19');
		expect(startFrom(thrive, { date: '2026-10-19', time: '09:00' }, null)).toBe(null);
		// one logged today, moved later: still logged for today
		expect(startFrom({ at: '16:00' }, { date: '2026-10-19', time: '12:00' }, '2026-10-19')).toBe('2026-10-19');
		expect(startFrom(thrive, { date: '2026-10-19', time: '12:00' }, '2026-10-18')).toBe('2026-10-19');
	});

	it('says when the next one is', () => {
		expect(nextDoseText({ ...thrive, lastLoggedOn: null }, { date: '2026-10-19', time: '08:00' })).toBe('Next today at 10:00');
		expect(nextDoseText({ ...thrive, lastLoggedOn: '2026-10-19' }, { date: '2026-10-19', time: '12:00' })).toBe('Next tomorrow at 10:00');
		// a Tuesday: the Mon, Wed, Fri dose is next on Wednesday
		expect(nextDoseText({ ...mwf, lastLoggedOn: null }, { date: '2026-10-20', time: '12:00' })).toBe('Next tomorrow at 10:00');
		expect(nextDoseText({ ...mwf, lastLoggedOn: null }, { date: '2026-10-21', time: '12:00' })).toBe('Next Fri at 10:00');
		expect(nextDoseText({ ...mwf, lastLoggedOn: null }, { date: '2026-10-23', time: '12:00' })).toBe('Next Mon at 10:00');
		expect(nextDoseText({ ...thrive, paused: true, lastLoggedOn: null }, { date: '2026-10-19', time: '08:00' })).toBe('Paused');
	});

	it('marks the day with the doses that run', () => {
		expect(doseMarks([thrive, { ...mwf, at: '10:05', paused: true }])).toEqual(['10:00']);
	});
});
