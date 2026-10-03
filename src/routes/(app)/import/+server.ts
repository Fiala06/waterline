import { error, redirect } from '@sveltejs/kit';
import { IMPORTS, importKindOf } from '$lib/imports';
import { getTank } from '$lib/server/tanks';
import type { RequestHandler } from './$types';

// Settings › Import & export picks a tank and a kind in one plain form: on to that import.
export const GET: RequestHandler = ({ url, locals }) => {
	const tank = getTank(locals.user!.id, url.searchParams.get('tank') ?? '', 'owner');
	const kind = importKindOf(url.searchParams.get('kind') ?? '') ?? error(404, 'Not found');
	redirect(303, `/tanks/${tank.id}/import/${IMPORTS[kind].slug}`);
};
