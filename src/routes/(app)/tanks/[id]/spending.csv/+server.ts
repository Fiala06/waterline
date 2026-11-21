// A tank's spending as a CSV (#314), with the filters the Spending tab shows
// (?cat=, ?from=, ?to=, ?q=, ?month=). Whoever can see the tab can download
// it; receipts are only said to be there, never linked.
import { equipmentNames, expensesCsv, listExpenses } from '$lib/server/expenses';
import { getTank } from '$lib/server/tanks';
import { inSpendingFilter, readSpendingFilter } from '$lib/spending-filter';
import { todayInZone } from '$lib/time';
import type { RequestHandler } from './$types';

const slug = (name: string) =>
	name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'tank';

export const GET: RequestHandler = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const f = readSpendingFilter(url.searchParams);
	const items = equipmentNames([tank.id]);
	const rows = listExpenses(user.id, tank.id).filter((e) => inSpendingFilter(f, e, e.equipmentId ? (items.get(e.equipmentId) ?? null) : null));
	return new Response(expensesCsv(rows, new Map([[tank.id, tank.name]]), items), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-spending-${slug(tank.name)}-${todayInZone(user.timeZone)}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
