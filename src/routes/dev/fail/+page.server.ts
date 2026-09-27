import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): a page that fails, for the tests of
// error pages' references and the log.
export const load: PageServerLoad = () => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404, 'Not found');
	throw new Error('A failure on purpose, for the tests');
};
