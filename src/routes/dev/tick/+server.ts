import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { logDueDoses } from '$lib/server/dosers';
import { pollAllPlugs } from '$lib/server/plugs';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): run the scheduler's logging of dosers'
// doses as if it were ?now= (an instant), and its reading of smart plugs (#203), for the tests; the scheduler itself is
// off there (EMAIL_SCHEDULER=off).
export const POST: RequestHandler = async ({ url }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const now = url.searchParams.get('now');
	const at = now ? new Date(now) : new Date();
	if (Number.isNaN(at.getTime())) error(400, 'now must be an instant');
	const logged = await logDueDoses(at);
	await pollAllPlugs(fetch, at.getTime());
	return json({ logged });
};
