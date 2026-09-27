// The same read-only tools as the MCP endpoint (#9), as plain JSON over GET,
// for scripts and assistants that call HTTP APIs. Signed in by an access token
// from Settings › AI assistant.
import { json } from '@sveltejs/kit';
import { authenticateAssistant } from '$lib/server/assistant/tokens';
import { photoFor, photoImage, runTool, ToolError } from '$lib/server/assistant/tools';
import type { RequestHandler } from './$types';

/** /tanks/<id>/<what> → the tool that answers it. */
const TANK_TOOLS: Record<string, string> = {
	summary: 'get_tank_summary',
	readings: 'get_readings',
	history: 'get_history',
	livestock: 'get_livestock',
	trends: 'get_trends',
	photos: 'list_photos'
};

export const GET: RequestHandler = async ({ request, params, url }) => {
	const access = authenticateAssistant(request.headers.get('authorization'));
	if (!access) {
		return json({ error: 'An access token is needed: send it as "Authorization: Bearer <token>".' }, { status: 401, headers: { 'www-authenticate': 'Bearer realm="waterline"' } });
	}
	const q = Object.fromEntries(url.searchParams);
	const parts = params.path.split('/').filter(Boolean);
	const headers = { 'cache-control': 'no-store' };
	try {
		if (parts.length === 1 && parts[0] === 'tanks') {
			const r = await runTool(access, 'list_tanks', {});
			return json(r.kind === 'json' ? r.data : null, { headers });
		}
		if (parts.length === 3 && parts[0] === 'tanks' && TANK_TOOLS[parts[2]]) {
			const r = await runTool(access, TANK_TOOLS[parts[2]], { ...q, tank_id: parts[1], include_removed: q.include_removed === 'true' });
			if (r.kind === 'text') return new Response(r.text, { headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' } });
			return json(r.kind === 'json' ? r.data : null, { headers });
		}
		if (parts.length === 2 && parts[0] === 'photos') {
			const { photo } = photoFor(access, parts[1]);
			const body = await photoImage(photo, q.size === 'small' ? 'small' : 'large');
			return new Response(new Uint8Array(body), { headers: { ...headers, 'content-type': 'image/jpeg' } });
		}
	} catch (e) {
		if (e instanceof ToolError) return json({ error: e.message }, { status: 404, headers });
		throw e;
	}
	return json({ error: 'Not found' }, { status: 404, headers });
};
