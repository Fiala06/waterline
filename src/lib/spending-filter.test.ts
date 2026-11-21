import { describe, expect, it } from 'vitest';
import { inSpendingFilter, isFiltered, monthEnd, readSpendingFilter, spendingQuery } from './spending-filter';

const read = (q: string) => readSpendingFilter(new URLSearchParams(q));
const e = (o: Partial<{ category: string; date: string; what: string; note: string | null }> = {}) => ({ category: 'equipment', date: '2026-09-10', what: 'Heater', note: null, ...o });

describe("Spending's filters (#314)", () => {
	it('reads a category, dates, words and a month bar', () => {
		expect(read('cat=plants&from=2026-01-01&to=2026-03-31&q=%20java%20%20fern ')).toEqual({ cat: 'plants', from: '2026-01-01', to: '2026-03-31', q: 'java fern' });
		expect(read('month=2026-02')).toEqual({ cat: null, from: '2026-02-01', to: '2026-02-28', q: '' });
		expect(read('cat=nope&from=junk&to=2026-13-01')).toEqual({ cat: null, from: null, to: null, q: '' });
		// the wrong way round is put right
		expect(read('from=2026-05-01&to=2026-04-01')).toMatchObject({ from: '2026-04-01', to: '2026-05-01' });
		expect(monthEnd('2024-02')).toBe('2024-02-29');
		expect(isFiltered(read(''))).toBe(false);
	});

	it('keeps what matches every filter at once, words in what for, the note or the item, accents aside', () => {
		const f = read('cat=equipment&from=2026-09-01&to=2026-09-30&q=jager');
		expect(inSpendingFilter(f, e(), 'Eheim Jäger 50')).toBe(true);
		expect(inSpendingFilter(f, e({ what: 'Jäger heater' }))).toBe(true);
		expect(inSpendingFilter(f, e({ note: 'for the jäger' }))).toBe(true);
		expect(inSpendingFilter(f, e())).toBe(false);
		expect(inSpendingFilter(f, e({ category: 'plants', what: 'Jager' }))).toBe(false);
		expect(inSpendingFilter(f, e({ date: '2026-10-01', what: 'Jager' }))).toBe(false);
		expect(inSpendingFilter(f, e({ date: '2026-09-30', what: 'Jager' }))).toBe(true);
	});

	it('writes the filter back with one part changed', () => {
		const f = read('cat=plants&q=moss');
		expect(spendingQuery(f)).toBe('?cat=plants&q=moss');
		expect(spendingQuery(f, { cat: null, from: '2026-09-01', to: '2026-09-30' })).toBe('?from=2026-09-01&to=2026-09-30&q=moss');
		expect(spendingQuery(read(''))).toBe('');
	});
});
