import { importTemplate, type ImportList } from '$lib/server/import-rows';
import { getTank } from '$lib/server/tanks';
import type { RequestHandler } from './$types';

/** The CSV to fill in, with the keeper's units in the column names. */
export const GET: RequestHandler = ({ locals, params }) => {
	const user = locals.user!;
	getTank(user.id, params.id);
	const list = params.list as ImportList;
	return new Response(importTemplate(list, user), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-${list}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
