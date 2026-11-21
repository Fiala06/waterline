import { describe, expect, it, vi } from 'vitest';

// expenses.ts opens the database; these tests only need its sums
vi.mock('./db', () => ({ db: {} }));
const { spendingSummary } = await import('./expenses');

type Cat = 'livestock' | 'plants' | 'equipment' | 'consumables' | 'other';
const e = (date: string, amountCents: number, category: Cat = 'other', currency = 'USD') => ({ date, amountCents, category, currency });

describe('spendingSummary', () => {
	const rows = [
		e('2026-09-20', 1250, 'consumables'),
		e('2026-09-02', 4000, 'livestock'),
		e('2026-08-15', 1999, 'consumables'),
		e('2026-01-10', 12000, 'equipment'),
		e('2025-12-24', 5000, 'plants')
	];

	it('adds up this month, this year and all time', () => {
		const s = spendingSummary(rows, '2026-09-27');
		expect(s).toMatchObject({ main: 'USD', month: { USD: 5250 }, year: { USD: 19249 }, yearCents: 19249, all: { USD: 24249 } });
	});

	it("splits this year by category, biggest first, without last year's", () => {
		expect(spendingSummary(rows, '2026-09-27').byCategory).toEqual([
			{ key: 'equipment', label: 'Equipment', sums: { USD: 12000 }, cents: 12000 },
			{ key: 'livestock', label: 'Livestock', sums: { USD: 4000 }, cents: 4000 },
			{ key: 'consumables', label: 'Consumables', sums: { USD: 3249 }, cents: 3249 }
		]);
	});

	it('has each of the last 12 months, oldest first, empty ones as 0', () => {
		const { months } = spendingSummary(rows, '2026-09-27');
		expect(months).toHaveLength(12);
		expect(months[0]).toEqual({ key: '2025-10', label: 'Oct 2025', sums: {}, cents: 0 });
		expect(months[2]).toEqual({ key: '2025-12', label: 'Dec 2025', sums: { USD: 5000 }, cents: 5000 });
		expect(months.at(-1)).toEqual({ key: '2026-09', label: 'Sep 2026', sums: { USD: 5250 }, cents: 5250 });
		// March has 31 days, February doesn't: every month is there once
		expect(new Set(months.map((m) => m.key)).size).toBe(12);
	});

	it('keeps each currency apart, never converting (#307)', () => {
		const mixed = [e('2026-09-20', 1299, 'livestock', 'USD'), e('2026-09-21', 500, 'livestock', 'EUR'), e('2026-09-22', 150000, 'plants', 'JPY')];
		// the keeper now prefers euros: bars are measured in euros
		const s = spendingSummary(mixed, '2026-09-27', 'EUR');
		expect(s.main).toBe('EUR');
		expect(s.month).toEqual({ USD: 1299, EUR: 500, JPY: 150000 });
		expect(s.byCategory).toEqual([
			{ key: 'livestock', label: 'Livestock', sums: { USD: 1299, EUR: 500 }, cents: 500 },
			{ key: 'plants', label: 'Plants', sums: { JPY: 150000 }, cents: 0 }
		]);
		// none in the preference: the currency with the most amounts
		expect(spendingSummary([e('2026-09-20', 100, 'other', 'GBP'), e('2026-09-21', 100, 'other', 'GBP'), e('2026-09-21', 100)], '2026-09-27', 'EUR').main).toBe('GBP');
	});
});
