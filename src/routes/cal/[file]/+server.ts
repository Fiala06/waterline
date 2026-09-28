// /cal/<token>.ics: the keeper's tasks for a calendar app (#23). The secret in
// the address is the only sign-in; ?tank=<id> for one tank.
import { error } from '@sveltejs/kit';
import { feedCalendar, readFeed } from '$lib/server/calendar';
import { listTanks } from '$lib/server/tanks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => {
	const token = params.file.replace(/\.ics$/, '');
	const user = token !== params.file ? readFeed(token) : null;
	if (!user) error(404, 'Not found');
	const tankId = url.searchParams.get('tank');
	const tank = tankId ? listTanks(user.id).find((t) => t.id === tankId) : undefined;
	if (tankId && !tank) error(404, 'Not found');
	const body = feedCalendar(user, url.origin, { tankId: tank?.id, tankName: tank?.name });
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': `inline; filename="waterline${tank ? '-tank' : ''}.ics"`,
			'cache-control': 'private, max-age=900',
			'x-robots-tag': 'noindex'
		}
	});
};
