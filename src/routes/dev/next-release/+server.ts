import { error, text } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): a changelog with a release newer than
// any, for the update check's end-to-end tests (UPDATE_CHECK_URL points here).
export const GET: RequestHandler = () => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	return text('# Changelog\n\n## 99.0.0 · 2026-12-01\n\n- **Something new:** a release from the future, for the tests.\n');
};
