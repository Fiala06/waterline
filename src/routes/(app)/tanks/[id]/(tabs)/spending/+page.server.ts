import { fmtMoney, fmtSums, sumByCurrency, type Sums } from '$lib/money';
import { fmtDateLong, todayInZone } from '$lib/time';
import { CATEGORY_LABEL, equipmentNames, listExpenses, spendingSummary, spentThisYear, type ExpenseCategory } from '$lib/server/expenses';
import { listTanks } from '$lib/server/tanks';
import { readSort, sortRows } from '$lib/sort';
import { inSpendingFilter, isFiltered, monthEnd, readSpendingFilter, spendingQuery } from '$lib/spending-filter';
import type { PageServerLoad } from './$types';

/** What a keeper can sort expenses by (#79) */
const SORTS = ['date', 'amount', 'category'] as const;

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const today = todayInZone(user.timeZone);
	const rows = listExpenses(user.id, params.id);
	const s = spendingSummary(rows, today, user.currency);
	// each amount in its own currency, totals per currency, never converted (#307)
	const money = (sums: Sums) => fmtSums(sums, user.currency);
	const peak = Math.max(1, ...s.months.map((m) => m.cents));
	// the list's filters (#314): a category, dates, words, all at once; a bar is a shortcut to its category or month
	const f = readSpendingFilter(url.searchParams);
	const sort = readSort(url, SORTS);
	const items = equipmentNames([params.id]);
	const filtered = rows.filter((e) => inSpendingFilter(f, e, e.equipmentId ? (items.get(e.equipmentId) ?? null) : null));
	const shown = sortRows(filtered, sort, (e, k) => (k === 'date' ? e.date : k === 'amount' ? e.amountCents : CATEGORY_LABEL[e.category]));
	// a month bar is on when the dates are that month's
	const monthOn = (key: string) => f.from === `${key}-01` && f.to === monthEnd(key);
	// the item an expense was for (#148), when its name says more than "What for" already does
	const itemOf = (e: { equipmentId: string | null; what: string }) => {
		const name = e.equipmentId ? items.get(e.equipmentId) : null;
		return name && name.trim().toLowerCase() !== e.what.trim().toLowerCase() ? name : null;
	};
	return {
		year: today.slice(0, 4),
		totals: { month: money(s.month), year: money(s.year), all: money(s.all) },
		byCategory: s.byCategory.map((c) => {
			const on = f.cat === c.key;
			return { ...c, amount: money(c.sums), share: s.yearCents ? c.cents / s.yearCents : 0, on, href: spendingQuery(f, { cat: on ? null : c.key }) };
		}),
		months: s.months.map((m) => {
			const on = monthOn(m.key);
			return { ...m, amount: money(m.sums), spent: Object.keys(m.sums).length > 0, share: m.cents / peak, on, href: spendingQuery(f, on ? { from: null, to: null } : { from: `${m.key}-01`, to: monthEnd(m.key) }) };
		}),
		// every tank this year, when there's more than one
		allTanks: listTanks(user.id).length > 1 ? money(spentThisYear(user.id, today.slice(0, 4))) : null,
		filter: { ...f, on: isFiltered(f), query: spendingQuery(f) },
		categories: Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key: key as ExpenseCategory, label })),
		// what the filters show, apart from the headline totals
		shownTotal: money(sumByCurrency(filtered.map((e) => ({ cents: e.amountCents, currency: e.currency })))),
		total: rows.length,
		sort,
		expenses: shown.map((e) => ({
			id: e.id,
			what: e.what,
			amount: fmtMoney(e.amountCents, e.currency),
			category: CATEGORY_LABEL[e.category],
			day: fmtDateLong(e.date),
			item: itemOf(e),
			receipt: e.receiptType
		}))
	};
};
