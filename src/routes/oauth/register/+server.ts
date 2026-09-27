// An app registers itself before sending the keeper to sign in (RFC 7591).
import { json } from '@sveltejs/kit';
import { CORS, preflight } from '$lib/server/assistant/discovery';
import { OAuthError, registerClient } from '$lib/server/assistant/oauth';
import { logger } from '$lib/server/log';
import { allowRate } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const headers = { ...CORS, 'cache-control': 'no-store' };

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!allowRate(`register:${getClientAddress()}`, 20)) {
		return json({ error: 'slow_down', error_description: 'Too many registrations from this address. Try again in an hour.' }, { status: 429, headers });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_client_metadata', error_description: 'The body must be JSON.' }, { status: 400, headers });
	}
	try {
		const out = registerClient(body);
		logger.info('assistant', `App "${out.client_name}" registered to connect`, { redirects: out.redirect_uris.map((u) => new URL(u).origin) });
		return json(out, { status: 201, headers });
	} catch (e) {
		if (e instanceof OAuthError) return json({ error: e.code, error_description: e.message }, { status: e.status, headers });
		throw e;
	}
};
export const OPTIONS: RequestHandler = preflight;
