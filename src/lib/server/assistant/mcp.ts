// The Model Context Protocol, just enough of it (#9): JSON-RPC 2.0 over one
// POST endpoint (Streamable HTTP, answered with plain JSON), no sessions, and
// tools only. Every tool reads; none change anything.
import { VERSION } from '$lib/changelog';
import { logger } from '../log';
import { runTool, ToolError, TOOLS } from './tools';
import type { AssistantAccess } from './tokens';

/** Newest first; a client asking for another gets the newest. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
	"Waterline is the keeper's aquarium log. You can read the tanks they shared with you: water test readings against their targets, History (water changes, dosing, maintenance, notes and more), livestock and plants, trends and photos. " +
	"You can't change anything. Start with list_tanks, then get_tank_summary for the whole picture of a tank. Values are in the keeper's units and times in their time zone.";

interface JsonRpcMessage {
	jsonrpc?: unknown;
	id?: unknown;
	method?: unknown;
	params?: unknown;
}

type Id = string | number | null;
export type JsonRpcResponse = { jsonrpc: '2.0'; id: Id } & ({ result: unknown } | { error: { code: number; message: string } });

const ok = (id: Id, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

export const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const isId = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One message in; its response, or null for a notification (or a response to us). */
export async function handleMessage(access: AssistantAccess, msg: unknown): Promise<JsonRpcResponse | null> {
	const m = obj(msg) as JsonRpcMessage;
	if (m.jsonrpc !== '2.0' || (m.method === undefined && !('result' in m) && !('error' in m))) {
		return fail(isId(m.id) ? m.id : null, INVALID_REQUEST, 'Not a JSON-RPC 2.0 message');
	}
	// notifications (initialized, cancelled) and responses: nothing to answer
	if (typeof m.method !== 'string' || !isId(m.id)) return null;
	const id = m.id;
	const params = obj(m.params);

	switch (m.method) {
		case 'initialize': {
			const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
			return ok(id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: 'waterline', title: 'Waterline', version: VERSION },
				instructions: INSTRUCTIONS
			});
		}
		case 'ping':
			return ok(id, {});
		case 'tools/list':
			return ok(id, {
				tools: TOOLS.map((t) => ({
					name: t.name,
					title: t.title,
					description: t.description,
					inputSchema: t.inputSchema,
					annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
				}))
			});
		case 'tools/call': {
			const name = typeof params.name === 'string' ? params.name : '';
			if (!TOOLS.some((t) => t.name === name)) return fail(id, INVALID_PARAMS, `Unknown tool: ${name || '(none)'}`);
			try {
				const r = await runTool(access, name, obj(params.arguments));
				if (r.kind === 'image') {
					return ok(id, {
						content: [
							{ type: 'image', data: r.data.toString('base64'), mimeType: r.mimeType },
							{ type: 'text', text: r.caption }
						]
					});
				}
				const text = r.kind === 'text' ? r.text : JSON.stringify(r.data);
				return ok(id, { content: [{ type: 'text', text }], ...(r.kind === 'json' ? { structuredContent: r.data } : {}) });
			} catch (e) {
				// a wrong id or a tank it can't see: the assistant reads why and tries again
				if (e instanceof ToolError) return ok(id, { content: [{ type: 'text', text: e.message }], isError: true });
				logger.error('assistant', `Tool ${name} failed`, { error: e, userId: access.user.id });
				return fail(id, INTERNAL_ERROR, `${name} failed. The server's log has the details.`);
			}
		}
		default:
			return fail(id, METHOD_NOT_FOUND, `Method not found: ${m.method}`);
	}
}

/** A POST's body: one message, or a batch (clients on 2025-03-26 may send those). */
export async function handleBody(access: AssistantAccess, body: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
	if (Array.isArray(body)) {
		if (!body.length) return fail(null, INVALID_REQUEST, 'Empty batch');
		const out = (await Promise.all(body.map((m) => handleMessage(access, m)))).filter((r): r is JsonRpcResponse => r !== null);
		return out.length ? out : null;
	}
	return handleMessage(access, body);
}
