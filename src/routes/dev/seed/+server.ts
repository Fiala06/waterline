import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { seedDemo } from '$lib/server/seed';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): fill the database with a demo account.
export const POST: RequestHandler = async () => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	return json(await seedDemo());
};
