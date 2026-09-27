import { error } from '@sveltejs/kit';
import { importKindOf, isHistoryKind } from '$lib/imports';
import { historyContext } from '$lib/server/import';
import { historyTemplate } from '$lib/server/import-history';
import { importTemplate } from '$lib/server/import-rows';
import { getTank } from '$lib/server/tanks';
import type { RequestHandler } from './$types';

/** The CSV to fill in, with the keeper's units in the column names (a water test's are the tank's parameters). */
export const GET: RequestHandler = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const kind = importKindOf(params.list) ?? error(404, 'Not found');
	const csv = isHistoryKind(kind) ? historyTemplate(kind, historyContext(user, tank)) : importTemplate(kind, user);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-${params.list}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
