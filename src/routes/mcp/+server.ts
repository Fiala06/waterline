// The MCP endpoint for a connected AI assistant (#9): Streamable HTTP, POST
// only, answered with JSON. Signed in by its access token, never the session
// cookie: pasted from Settings › AI assistant, or given to an app that
// connected by signing in (OAuth, see $lib/server/assistant/oauth).
import { json } from '@sveltejs/kit';
import { authenticateAssistant } from '$lib/server/assistant/tokens';
import { handleBody, PARSE_ERROR, PROTOCOL_VERSIONS } from '$lib/server/assistant/mcp';
import { bearerChallenge } from '$lib/server/assistant/discovery';
import type { RequestHandler } from './$types';

// without a token (or with one that ran out), where to learn how to sign in
const unauthorized = (origin: string, hadToken: boolean) =>
	json(
		{ error: 'Sign in to connect, or make an access token in Waterline under Settings › AI assistant and send it as "Authorization: Bearer <token>".' },
		{ status: 401, headers: { 'www-authenticate': bearerChallenge(origin, '/mcp', hadToken) } }
	);

export const POST: RequestHandler = async ({ request, url }) => {
	const auth = request.headers.get('authorization');
	const access = authenticateAssistant(auth);
	if (!access) return unauthorized(url.origin, !!auth);
	const version = request.headers.get('mcp-protocol-version');
	if (version && !PROTOCOL_VERSIONS.includes(version)) {
		return json({ error: `Unsupported MCP-Protocol-Version ${version}; this server speaks ${PROTOCOL_VERSIONS.join(', ')}.` }, { status: 400 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } }, { status: 400 });
	}
	const out = await handleBody(access, body);
	// only notifications (or responses): accepted, nothing to say
	if (out === null) return new Response(null, { status: 202 });
	return json(out, { headers: { 'cache-control': 'no-store' } });
};

// No server-to-client stream and no sessions to end.
const notAllowed: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
