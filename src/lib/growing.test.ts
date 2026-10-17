import { describe, expect, it } from 'vitest';
import { co2RelativeText, doseText, growingRows, nextDoseText } from './growing';

const one = (on: string, off: string) => ({ periods: [{ on, off }], rampMin: null });

describe('growing setup (#96, #97)', () => {
	it('says how the CO₂ runs against the lights', () => {
		expect(co2RelativeText(one('08:00', '16:00'), one('07:00', '15:00'))).toBe('on 1 h before the lights · off 1 h before the lights');
		expect(co2RelativeText(one('08:00', '16:00'), one('08:00', '16:00'))).toBe('with the lights');
		expect(co2RelativeText(one('08:00', '16:00'), one('08:30', '15:00'))).toBe('on 30 min after the lights · off 1 h before the lights');
		expect(co2RelativeText(one('08:00', '16:00'), one('06:30', '16:00'))).toBe('on 1 h 30 min before the lights · off with the lights');
		expect(co2RelativeText({ periods: [{ on: '08:00', off: '12:00' }, { on: '14:00', off: '18:00' }], rampMin: null }, one('07:00', '15:00'))).toBeNull();
	});

	it('names a dose and when the next is', () => {
		expect(doseText({ title: 'Dose Thrive', product: 'Thrive', amount: 5, amountUnit: 'mL' })).toBe('Thrive 5 mL');
		expect(doseText({ title: 'Dose Thrive', product: 'Thrive', amount: null, amountUnit: null })).toBe('Thrive');
		expect(doseText({ title: 'Ferts', product: null, amount: null, amountUnit: null })).toBe('Ferts');
		expect(nextDoseText('2026-10-07', '2026-10-07')).toBe('due today');
		expect(nextDoseText('2026-10-08', '2026-10-07')).toBe('tomorrow');
		expect(nextDoseText('2026-10-10', '2026-10-07')).toBe('Sat');
		expect(nextDoseText('2026-10-20', '2026-10-07')).toBe('Oct 20');
		expect(nextDoseText('2026-10-05', '2026-10-07')).toBe('✕ overdue 2 days');
	});

	it('makes a row of each thing that is set, and none of what is not', () => {
		const rows = growingRows({
			tankId: 't1',
			lights: { schedule: one('08:00', '16:00'), hours: 8, itemId: null },
			co2: { schedule: one('07:00', '15:00'), hours: 8, itemId: 'co2item' },
			substrate: 'Aquasoil',
			dosing: [{ id: 'd1', title: 'Dose Thrive', product: 'Thrive', amount: 5, amountUnit: 'mL', nextDue: '2026-10-09', interval: 'every 3 days' }],
			today: '2026-10-07'
		});
		expect(rows.map((r) => [r.title, r.text, r.href])).toEqual([
			['Light', '8 h/day · 08:00–16:00', '/tanks/t1/settings#lights'],
			['CO₂', '07:00–15:00 · on 1 h before the lights · off 1 h before the lights', '/tanks/t1/equipment/co2item'],
			['Fertilizer', 'Thrive 5 mL · every 3 days · Fri', '/tasks/d1'],
			['Substrate', 'Aquasoil', '/tanks/t1/settings#substrate']
		]);
		expect(growingRows({ tankId: 't1', lights: null, co2: null, substrate: null, dosing: [], today: '2026-10-07' })).toEqual([]);
	});
});
