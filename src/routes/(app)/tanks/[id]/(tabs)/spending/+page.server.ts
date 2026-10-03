import { fmtMoney } from '$lib/money';
import { fmtDateLong, todayInZone } from '$lib/time';
import { CATEGORY_LABEL, listExpenses, spendingSummary, spentThisYear, type ExpenseCategory } from '$lib/server/expenses';
import { listTanks } from '$lib/server/tanks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const today = todayInZone(user.timeZone);
	const rows = listExpenses(user.id, params.id);
	const s = spendingSummary(rows, today);
	const money = (c: number) => fmtMoney(c, user.currency);
	const peak = Math.max(1, ...s.months.map((m) => m.cents));
	// the list filtered by a category bar (?cat=equipment) or a month bar (?month=2026-09)
	const cat = url.searchParams.get('cat');
	const month = url.searchParams.get('month');
	const filter = cat && cat in CATEGORY_LABEL ? { kind: 'cat' as const, key: cat, label: CATEGORY_LABEL[cat as ExpenseCategory] } : month && /^\d{4}-\d{2}$/.test(month) ? { kind: 'month' as const, key: month, label: s.months.find((m) => m.key === month)?.label ?? month } : null;
	const shown = rows.filter((e) => (filter?.kind === 'cat' ? e.category === filter.key : filter?.kind === 'month' ? e.date.startsWith(filter.key) : true));
	return {
		year: today.slice(0, 4),
		totals: { month: money(s.month), year: money(s.year), all: money(s.all) },
		byCategory: s.byCategory.map((c) => ({ ...c, amount: money(c.cents), share: s.year ? c.cents / s.year : 0, on: filter?.kind === 'cat' && filter.key === c.key })),
		months: s.months.map((m) => ({ ...m, amount: money(m.cents), share: m.cents / peak, on: filter?.kind === 'month' && filter.key === m.key })),
		// every tank this year, when there's more than one
		allTanks: listTanks(user.id).length > 1 ? money(spentThisYear(user.id, today.slice(0, 4))) : null,
		filter,
		total: rows.length,
		expenses: shown.map((e) => ({
			id: e.id,
			what: e.what,
			amount: money(e.amountCents),
			category: CATEGORY_LABEL[e.category],
			day: fmtDateLong(e.date),
			receipt: e.receiptType
		}))
	};
};
