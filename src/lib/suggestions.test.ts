import { describe, expect, it } from 'vitest';
import { clearText, readingClears, suggestSteps, SUGGESTION_RULES, type SuggestContext } from './suggestions';

const ctx = (over: Partial<SuggestContext> = {}): SuggestContext => ({
	tankId: 't1',
	readings: [],
	cycled: true,
	waterChange: { id: 'wc', name: 'Water change 25%', intervalDays: 7, clearing: false },
	greenSpot: null,
	off: [],
	...over
});
const r = (key: string, value: number, name = key) => ({ paramId: `p-${key}`, key, value, name });

describe('suggested steps from readings (#179)', () => {
	it('every rule says when it applies, what it suggests and where it comes from', () => {
		for (const rule of SUGGESTION_RULES) {
			expect(rule.when).toBeTruthy();
			expect(rule.step).toBeTruthy();
			expect(rule.source).toBeTruthy();
		}
	});

	it('ammonia in a cycled tank: the water change every 2 days until it reads 0', () => {
		const [s] = suggestSteps(ctx({ readings: [r('nh3', 0.25, 'Ammonia')] }));
		expect(s).toMatchObject({ rule: 'water_change_until_clear', paramId: 'p-nh3', action: { label: 'Water change every 2 days until ammonia reads 0', taskId: 'wc', every: 2 } });
		expect(s.text).toContain('then back to every 7 days');
	});

	it('nitrite counts too, ammonia first when both read', () => {
		expect(suggestSteps(ctx({ readings: [r('no2', 0.5, 'Nitrite')] }))[0].paramId).toBe('p-no2');
		expect(suggestSteps(ctx({ readings: [r('no2', 0.5), r('nh3', 0.25)] }))[0].paramId).toBe('p-nh3');
	});

	it('nothing at 0, while cycling, without a water change routine, or one already that often', () => {
		expect(suggestSteps(ctx({ readings: [r('nh3', 0)] }))).toEqual([]);
		expect(suggestSteps(ctx({ readings: [r('nh3', 1)], cycled: false }))).toEqual([]);
		expect(suggestSteps(ctx({ readings: [r('nh3', 1)], waterChange: null }))).toEqual([]);
		expect(suggestSteps(ctx({ readings: [r('nh3', 1)], waterChange: { id: 'wc', name: 'WC', intervalDays: 2, clearing: false } }))).toEqual([]);
		expect(suggestSteps(ctx({ readings: [r('nh3', 1)], waterChange: { id: 'wc', name: 'WC', intervalDays: 7, clearing: true } }))).toEqual([]);
	});

	it('never suggests dosing: nitrate at 0 suggests nothing, whatever the tank doses', () => {
		expect(suggestSteps(ctx({ readings: [r('no3', 0, 'Nitrate')] }))).toEqual([]);
		for (const rule of SUGGESTION_RULES) expect(`${rule.name} ${rule.step}`).not.toMatch(/\bdos(e|ing)\b/i);
	});

	it('phosphate under 0.1 ppm with green spot algae lately: a note linking the entry', () => {
		const greenSpot = { eventId: 'e1', date: '2026-10-10' };
		const [s] = suggestSteps(ctx({ readings: [r('po4', 0.05, 'Phosphate')], greenSpot }));
		expect(s).toMatchObject({ rule: 'phosphate_green_spot', link: { href: '/entries/event/e1' } });
		expect(s.text).toContain('Oct 10');
		expect(s.text).not.toMatch(/dos(e|ing)/i);
		expect(suggestSteps(ctx({ readings: [r('po4', 0.1)], greenSpot }))).toEqual([]);
		expect(suggestSteps(ctx({ readings: [r('po4', 0.05)] }))).toEqual([]);
	});

	it('a rule switched off for the tank suggests nothing', () => {
		const greenSpot = { eventId: 'e1', date: '2026-10-10' };
		expect(suggestSteps(ctx({ readings: [r('nh3', 1), r('po4', 0.05)], greenSpot, off: ['water_change_until_clear'] })).map((s) => s.rule)).toEqual(['phosphate_green_spot']);
	});

	it('says what clears it: 0 for ammonia and nitrite or a target of 0, else in range', () => {
		expect(clearText({ key: 'nh3', name: 'Ammonia', max: 0.25 })).toBe('ammonia reads 0');
		expect(clearText({ key: 'custom', name: 'Copper', max: 0 })).toBe('copper reads 0');
		expect(clearText({ key: 'no3', name: 'Nitrate', max: 20 })).toBe('nitrate is in range');
		expect(readingClears({ key: 'nh3', min: 0, max: 0.25 }, 0.25)).toBe(false);
		expect(readingClears({ key: 'nh3', min: 0, max: 0.25 }, 0)).toBe(true);
		expect(readingClears({ key: 'no3', min: 5, max: 20 }, 30)).toBe(false);
		expect(readingClears({ key: 'no3', min: 5, max: 20 }, 10)).toBe(true);
	});
});
