// The MCP endpoint for a connected AI assistant (#9): Streamable HTTP, POST
// only, answered with JSON. Signed in by its access token, never the session
// cookie: pasted from Settings › AI assistant, or given to an app that
// connected by signing in (OAuth, see $lib/server/assistant/oauth).
import { json } from '@sveltejs/kit';
import { authenticateAssistant } from '$lib/server/assistant/tokens';
import { handleBody, INVALID_REQUEST, MAX_BODY_BYTES, PARSE_ERROR, PROTOCOL_VERSIONS, readJsonBody } from '$lib/server/assistant/mcp';
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
	const read = await readJsonBody(request);
	if ('error' in read) {
		if (read.error === 'too-large') {
			// the rest of the body is never read, so this connection can't carry another request:
			// say so, or the client sends its next one down it and gets a reset (#280)
			return json(
				{ jsonrpc: '2.0', id: null, error: { code: INVALID_REQUEST, message: `Request too large: at most ${MAX_BODY_BYTES / 1024 / 1024} MB` } },
				{ status: 413, headers: { connection: 'close' } }
			);
		}
		return json({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } }, { status: 400 });
	}
	const out = await handleBody(access, read.body);
	// only notifications (or responses): accepted, nothing to say
	if (out === null) return new Response(null, { status: 202 });
	return json(out, { headers: { 'cache-control': 'no-store' } });
};

// No server-to-client stream and no sessions to end.
const notAllowed: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
export const GET = notAllowed;
export const DELETE = notAllowed;
