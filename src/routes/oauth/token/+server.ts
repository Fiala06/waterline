// Codes and refresh tokens swapped for access tokens (OAuth 2.1, with PKCE).
import { json } from '@sveltejs/kit';
import { CORS, preflight } from '$lib/server/assistant/discovery';
import { authenticateClient, exchangeCode, OAuthError, refreshTokens } from '$lib/server/assistant/oauth';
import type { RequestHandler } from './$types';

const headers = { ...CORS, 'cache-control': 'no-store', pragma: 'no-cache' };

export const POST: RequestHandler = async ({ request, url }) => {
	let form: URLSearchParams;
	try {
		form = new URLSearchParams(await request.text());
	} catch {
		form = new URLSearchParams();
	}
	try {
		const client = authenticateClient(form, request.headers.get('authorization'));
		const grant = form.get('grant_type');
		if (grant === 'authorization_code') return json(exchangeCode(client, form, url.origin), { headers });
		if (grant === 'refresh_token') return json(refreshTokens(client, form), { headers });
		throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token.');
	} catch (e) {
		if (!(e instanceof OAuthError)) throw e;
		const extra: Record<string, string> = e.status === 401 ? { 'www-authenticate': 'Basic realm="waterline"' } : {};
		return json({ error: e.code, error_description: e.message }, { status: e.status, headers: { ...headers, ...extra } });
	}
};
export const OPTIONS: RequestHandler = preflight;
