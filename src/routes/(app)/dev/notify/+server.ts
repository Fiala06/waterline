import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { notifyUser } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

// TEST ONLY (AUTH_DEV_LOGIN): run the signed-in user's scheduled emails now.
export const POST: RequestHandler = async ({ locals }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	return json(await notifyUser(locals.user!, new Date(), true));
};
