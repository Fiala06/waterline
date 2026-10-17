import { describe, expect, it } from 'vitest';
import { afterStep, runHref, runState, runSummary, stepHref } from './routines';

const q = (s: string) => new URLSearchParams(s);

describe('runState', () => {
	it('reads the step up next and what was logged or skipped, ignoring junk', () => {
		expect(runState(q('i=2&done=0&skipped=1'), 4)).toEqual({ i: 2, done: [0], skipped: [1] });
		expect(runState(q(''), 4)).toEqual({ i: 0, done: [], skipped: [] });
		expect(runState(q('i=9&done=0,0,7,x&skipped=0,2'), 4)).toEqual({ i: 4, done: [0], skipped: [2] });
		expect(runState(q('i=-3'), 4).i).toBe(0);
	});
});

describe('a run, step by step', () => {
	it('moves on after a step is taken or skipped, and the address carries it', () => {
		let s = runState(q(''), 3);
		s = afterStep(s, true);
		s = afterStep(s, false);
		expect(s).toEqual({ i: 2, done: [0], skipped: [1] });
		expect(runHref('/tanks/t1/routines/r1/run', s)).toBe('/tanks/t1/routines/r1/run?i=2&done=0&skipped=1');
		expect(runSummary(s, 3)).toBe('Step 3 of 3');
		s = afterStep(s, true);
		expect(runSummary(s, 3)).toBe('2 logged · 1 skipped');
		expect(runSummary({ i: 3, done: [0, 1, 2], skipped: [] }, 3)).toBe('3 logged');
	});

	it('opens a step’s form filled in, coming back with the step counted as done', () => {
		const s = { i: 1, done: [0], skipped: [] };
		const href = stepHref({ kind: 'water_change', label: '40% water change', fields: { amountMode: 'percent', amount: '40' } }, 't1', '/tanks/t1/routines/r1/run', s);
		expect(href).toBe('/entries/event/new?tank=t1&category=water_change&amountMode=percent&amount=40&from=%2Ftanks%2Ft1%2Froutines%2Fr1%2Frun%3Fi%3D2%26done%3D0%2C1');
		const test = stepHref({ kind: 'test', label: 'Water test', fields: {} }, 't1', '/b', { i: 0, done: [], skipped: [] });
		expect(test).toBe('/entries/test/new?tank=t1&from=%2Fb%3Fi%3D1%26done%3D0');
	});
});
