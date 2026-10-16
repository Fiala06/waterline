import { describe, expect, it } from 'vitest';
import { PLAN_TEMPLATES, planDays, stepDates, stepText, validStep } from './plans';

describe('treatment plan steps (#177)', () => {
	it('works out a step\'s dates from the day the plan starts', () => {
		expect(stepDates({ from: 1, to: 4, every: 1 }, '2026-10-16')).toEqual({ first: '2026-10-16', last: '2026-10-19', times: 4 });
		// every 3 days from day 2 to 14: days 2, 5, 8, 11, 14
		expect(stepDates({ from: 2, to: 14, every: 3 }, '2026-10-16')).toEqual({ first: '2026-10-17', last: '2026-10-29', times: 5 });
		// the last time falls before the step's last day when the cadence doesn't fit
		expect(stepDates({ from: 1, to: 10, every: 4 }, '2026-10-16').last).toBe('2026-10-24');
	});
	it('says so in a line', () => {
		expect(stepText({ from: 5, to: 5, every: 1 }, '2026-10-16')).toBe('Oct 20');
		expect(stepText({ from: 1, to: 4, every: 1 }, '2026-10-16')).toBe('Oct 16 – Oct 19 · every day · 4 times');
	});
	it('runs to its last step', () => {
		expect(planDays(PLAN_TEMPLATES.find((t) => t.key === 'blackout')!.steps)).toBe(19);
	});
	it('takes only steps that make sense', () => {
		expect(validStep({ name: 'Dose', from: 1, to: 5, every: 1 })).toBe(true);
		expect(validStep({ name: '', from: 1, to: 5, every: 1 })).toBe(false);
		expect(validStep({ name: 'Dose', from: 0, to: 5, every: 1 })).toBe(false);
		expect(validStep({ name: 'Dose', from: 5, to: 2, every: 1 })).toBe(false);
		expect(validStep({ name: 'Dose', from: 1, to: 5, every: 0 })).toBe(false);
	});
	it('ships starters that are all valid', () => {
		for (const t of PLAN_TEMPLATES) expect(t.steps.every(validStep), t.key).toBe(true);
	});
});
