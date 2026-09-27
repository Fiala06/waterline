import { fmtMoney } from '$lib/money';
import { fmtDateLong, todayInZone } from '$lib/time';
import { CATEGORY_LABEL, listExpenses, spendingSummary, spentThisYear } from '$lib/server/expenses';
import { listTanks } from '$lib/server/tanks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const today = todayInZone(user.timeZone);
	const rows = listExpenses(user.id, params.id);
	const s = spendingSummary(rows, today);
	const money = (c: number) => fmtMoney(c, user.currency);
	const peak = Math.max(1, ...s.months.map((m) => m.cents));
	return {
		year: today.slice(0, 4),
		totals: { month: money(s.month), year: money(s.year), all: money(s.all) },
		byCategory: s.byCategory.map((c) => ({ ...c, amount: money(c.cents), share: s.year ? c.cents / s.year : 0 })),
		months: s.months.map((m) => ({ ...m, amount: money(m.cents), share: m.cents / peak })),
		// every tank this year, when there's more than one
		allTanks: listTanks(user.id).length > 1 ? money(spentThisYear(user.id, today.slice(0, 4))) : null,
		expenses: rows.map((e) => ({
			id: e.id,
			what: e.what,
			amount: money(e.amountCents),
			category: CATEGORY_LABEL[e.category],
			day: fmtDateLong(e.date),
			receipt: e.receiptType
		}))
	};
};
