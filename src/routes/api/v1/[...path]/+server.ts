// The same read-only tools as the MCP endpoint (#9), as plain JSON over GET,
// for scripts and assistants that call HTTP APIs. Signed in by an access token
// from Settings › AI assistant.
import { json } from '@sveltejs/kit';
import { authenticateAssistant, authenticateSensor } from '$lib/server/assistant/tokens';
import { logger } from '$lib/server/log';
import { parseSamples, recordSamples } from '$lib/server/sensors';
import { bearerChallenge } from '$lib/server/assistant/discovery';
import { photoFor, photoImage, runTool, ToolError } from '$lib/server/assistant/tools';
import { toCsv } from '$lib/server/assistant/table-tools';
import type { RequestHandler } from './$types';

/** /tanks/<id>/<what> → the tool that answers it. */
const TANK_TOOLS: Record<string, string> = {
	summary: 'get_tank_summary',
	readings: 'get_readings',
	history: 'get_history',
	livestock: 'get_livestock',
	trends: 'get_trends',
	photos: 'list_photos',
	'reading-rows': 'get_reading_rows',
	'water-changes': 'get_water_changes',
	tasks: 'get_tasks',
	spending: 'get_spending'
};

/** /<what> → a table across every tank the token may read (narrowed by ?tank_id=), as JSON rows or ?format=csv. */
const TABLES: Record<string, string> = {
	overview: 'get_overview',
	readings: 'get_reading_rows',
	'water-changes': 'get_water_changes',
	tasks: 'get_tasks',
	spending: 'get_spending'
};

/** A table's rows as a CSV download, when ?format=csv asks for one. */
function tableResponse(data: unknown, format: string | undefined, name: string, headers: Record<string, string>) {
	const t = data as { columns?: string[]; rows?: Record<string, unknown>[] } | null;
	if (format === 'csv' && t?.columns && t.rows) {
		return new Response(toCsv(t.columns, t.rows), {
			headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="waterline-${name}.csv"` }
		});
	}
	return json(data, { headers });
}

export const GET: RequestHandler = async ({ request, params, url }) => {
	const auth = request.headers.get('authorization');
	const access = authenticateAssistant(auth);
	if (!access) {
		return json(
			{ error: 'An access token is needed: send it as "Authorization: Bearer <token>".' },
			{ status: 401, headers: { 'www-authenticate': bearerChallenge(url.origin, '/api/v1', !!auth) } }
		);
	}
	const q = Object.fromEntries(url.searchParams);
	const parts = params.path.split('/').filter(Boolean);
	const headers = { 'cache-control': 'no-store' };
	try {
		if (parts.length === 1 && parts[0] === 'tanks') {
			const r = await runTool(access, 'list_tanks', {});
			return json(r.kind === 'json' ? r.data : null, { headers });
		}
		if (parts.length === 1 && TABLES[parts[0]]) {
			const r = await runTool(access, TABLES[parts[0]], q);
			return tableResponse(r.kind === 'json' ? r.data : null, q.format, parts[0], headers);
		}
		if (parts.length === 3 && parts[0] === 'tanks' && TANK_TOOLS[parts[2]]) {
			const r = await runTool(access, TANK_TOOLS[parts[2]], { ...q, tank_id: parts[1], include_removed: q.include_removed === 'true' });
			if (r.kind === 'text') return new Response(r.text, { headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' } });
			return tableResponse(r.kind === 'json' ? r.data : null, q.format, parts[2], headers);
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

/**
 * Readings from a sensor or controller (#19): POST /api/v1/tanks/<id>/readings
 * with a sensor token (Settings › Sensors), one reading or { readings: [...] },
 * each { parameter, value, unit?, at? }. Samples go to their own table, at
 * most one a minute per parameter, and never raise an alert by themselves.
 */
export const POST: RequestHandler = async ({ request, params, url }) => {
	const headers = { 'cache-control': 'no-store' };
	const parts = params.path.split('/').filter(Boolean);
	if (!(parts.length === 3 && parts[0] === 'tanks' && parts[2] === 'readings')) return json({ error: 'Not found' }, { status: 404, headers });
	const auth = request.headers.get('authorization');
	const access = authenticateSensor(auth);
	if (!access) {
		return json(
			{ error: 'A sensor token is needed: make one in Settings › Sensors and send it as "Authorization: Bearer <token>".' },
			{ status: 401, headers: { ...headers, 'www-authenticate': bearerChallenge(url.origin, '/api/v1', !!auth) } }
		);
	}
	if (!access.tankIds.has(parts[1])) return json({ error: 'This token adds readings to other tanks, not this one.' }, { status: 404, headers });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Send JSON: { "parameter": "temp", "value": 25.4, "unit": "°C", "at": "2026-10-03T14:05:00Z" }.' }, { status: 400, headers });
	}
	const samples = parseSamples(body);
	if (typeof samples === 'string') return json({ error: samples }, { status: 400, headers });
	const results = recordSamples(parts[1], samples, access.token.name, access.token.id);
	const refused = results.filter((r) => !r.ok);
	if (refused.length === results.length) return json({ error: refused[0].ok ? '' : refused[0].error, results }, { status: 400, headers });
	logger.debug('assistant', `${access.token.name} sent ${results.length} reading${results.length === 1 ? '' : 's'}`, { userId: access.user.id, tankId: parts[1] });
	return json({ results }, { status: refused.length ? 207 : 200, headers });
};
