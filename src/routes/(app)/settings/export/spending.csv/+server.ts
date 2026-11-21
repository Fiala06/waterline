// Every expense on the keeper's own tanks as one CSV (#314), archived tanks
// included; not tanks others share with them. Receipts are only said to be
// there, never linked.
import { expensesCsv, ownedLedger } from '$lib/server/expenses';
import { todayInZone } from '$lib/time';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user!;
	const { rows, tankNames, items } = ownedLedger(user.id);
	return new Response(expensesCsv(rows, tankNames, items), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-spending-${todayInZone(user.timeZone)}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
