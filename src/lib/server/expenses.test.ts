import { describe, expect, it, vi } from 'vitest';

// expenses.ts opens the database; these tests only need its sums
vi.mock('./db', () => ({ db: {} }));
const { spendingSummary } = await import('./expenses');

const e = (date: string, amountCents: number, category: 'livestock' | 'plants' | 'equipment' | 'consumables' | 'other' = 'other') => ({ date, amountCents, category });

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
		expect(s).toMatchObject({ month: 5250, year: 19249, all: 24249 });
	});

	it("splits this year by category, biggest first, without last year's", () => {
		expect(spendingSummary(rows, '2026-09-27').byCategory).toEqual([
			{ key: 'equipment', label: 'Equipment', cents: 12000 },
			{ key: 'livestock', label: 'Livestock', cents: 4000 },
			{ key: 'consumables', label: 'Consumables', cents: 3249 }
		]);
	});

	it('has each of the last 12 months, oldest first, empty ones as 0', () => {
		const { months } = spendingSummary(rows, '2026-09-27');
		expect(months).toHaveLength(12);
		expect(months[0]).toEqual({ key: '2025-10', label: 'Oct 2025', cents: 0 });
		expect(months[2]).toEqual({ key: '2025-12', label: 'Dec 2025', cents: 5000 });
		expect(months.at(-1)).toEqual({ key: '2026-09', label: 'Sep 2026', cents: 5250 });
		// March has 31 days, February doesn't: every month is there once
		expect(new Set(months.map((m) => m.key)).size).toBe(12);
	});
});
