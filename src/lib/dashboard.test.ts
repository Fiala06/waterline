import { describe, expect, it } from 'vitest';
import { customized, DEFAULT_CHOICES, parseChoices, prioritize } from './dashboard';

const form = (entries: [string, string][]) => {
	const f = new FormData();
	for (const [k, v] of entries) f.append(k, v);
	return f;
};

describe('parseChoices', () => {
	it('keeps known parameters, at most three first, and hides what is not ticked', () => {
		const c = parseChoices(
			form([
				['trend', 'kh'],
				['priority', 'kh'],
				['priority', 'x'],
				['priority', 'no3'],
				['priority', 'kh'],
				['priority', 'ph'],
				['priority', 'gh'],
				['show', 'trends'],
				['show', 'recent'],
				['show', 'nope']
			]),
			['ph', 'kh', 'no3', 'gh']
		);
		expect(c).toEqual({ trendParamId: 'kh', priority: ['kh', 'no3', 'ph'], hidden: ['inTank', 'growing', 'live'] });
	});
	it('reads the defaults back from a form with everything ticked and nothing picked', () => {
		const c = parseChoices(form([['trend', ''], ['show', 'trends'], ['show', 'recent'], ['show', 'inTank'], ['show', 'growing'], ['show', 'live']]), ['ph']);
		expect(c).toEqual(DEFAULT_CHOICES);
		expect(customized(c)).toBe(false);
		expect(customized({ ...c, trendParamId: 'ph' })).toBe(true);
	});
});

describe('prioritize', () => {
	it('puts the chosen ones first, in order, and leaves the rest as they were', () => {
		const ps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
		expect(prioritize(ps, ['c', 'a']).map((p) => p.id)).toEqual(['c', 'a', 'b', 'd']);
		expect(prioritize(ps, ['zz']).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(prioritize(ps, [])).toBe(ps);
	});
});
