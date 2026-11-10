import { describe, expect, it, vi } from 'vitest';

// the protocol only: the tools are stand-ins
vi.mock('../log', () => ({ logger: { error: vi.fn() } }));
vi.mock('./tools', () => {
	class ToolError extends Error {}
	return {
		ToolError,
		TOOLS: [
			{ name: 'list_tanks', title: 'List tanks', description: 'd', inputSchema: { type: 'object', properties: {} } },
			{ name: 'get_tank_summary', title: 'Summary', description: 'd', inputSchema: { type: 'object', properties: {} } },
			{ name: 'get_photo', title: 'Photo', description: 'd', inputSchema: { type: 'object', properties: {} } },
			{ name: 'broken', title: 'Broken', description: 'd', inputSchema: { type: 'object', properties: {} } }
		],
		runTool: async (_access: unknown, name: string, args: Record<string, unknown>) => {
			if (name === 'list_tanks') return { kind: 'json', data: { tanks: [{ id: 't1' }] } };
			if (name === 'get_tank_summary') {
				if (args.tank_id !== 't1') throw new ToolError('No tank nope is shared with this assistant.');
				return { kind: 'text', text: '# Riverbed 40' };
			}
			if (name === 'get_photo') return { kind: 'image', data: Buffer.from('jpeg'), mimeType: 'image/jpeg', caption: 'A photo' };
			throw new Error('database gone');
		}
	};
});
const { handleBody, handleMessage, MAX_BATCH, PROTOCOL_VERSIONS, readJsonBody } = await import('./mcp');

const access = { user: { id: 'u1' }, token: {}, tankIds: new Set(['t1']) } as never;
const req = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
const call = (name: string, args: Record<string, unknown> = {}) => handleMessage(access, req('tools/call', { name, arguments: args }));

describe('initialize', () => {
	it('answers in the version the client asked for, when it knows it', async () => {
		const r = (await handleMessage(access, req('initialize', { protocolVersion: '2025-03-26', capabilities: {} }))) as { result: Record<string, unknown> };
		expect(r.result.protocolVersion).toBe('2025-03-26');
		expect(r.result.capabilities).toEqual({ tools: { listChanged: false } });
		expect(r.result.serverInfo).toMatchObject({ name: 'waterline' });
		expect(r.result.instructions).toContain("can't change anything");
	});

	it('offers its newest version for one it does not know', async () => {
		const r = (await handleMessage(access, req('initialize', { protocolVersion: '1999-01-01' }))) as { result: Record<string, unknown> };
		expect(r.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
	});
});

describe('messages', () => {
	it('answers nothing to notifications and to responses', async () => {
		expect(await handleMessage(access, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
		expect(await handleMessage(access, { jsonrpc: '2.0', id: 5, result: {} })).toBeNull();
	});

	it('answers a request whose id or method is unusable, so nobody waits on it', async () => {
		expect(await handleMessage(access, { jsonrpc: '2.0', id: 7, method: 5 })).toMatchObject({ id: 7, error: { code: -32600 } });
		expect(await handleMessage(access, { jsonrpc: '2.0', id: null, method: 'ping' })).toMatchObject({ id: null, error: { code: -32600 } });
		expect(await handleMessage(access, { jsonrpc: '2.0', id: { a: 1 }, method: 'ping' })).toMatchObject({ id: null, error: { code: -32600 } });
	});

	it('refuses what is not JSON-RPC 2.0', async () => {
		expect(await handleMessage(access, { id: 1, method: 'ping' })).toMatchObject({ id: 1, error: { code: -32600 } });
		expect(await handleMessage(access, 'hello')).toMatchObject({ id: null, error: { code: -32600 } });
	});

	it('pings, and says which methods it lacks', async () => {
		expect(await handleMessage(access, req('ping', undefined, 'a'))).toEqual({ jsonrpc: '2.0', id: 'a', result: {} });
		expect(await handleMessage(access, req('resources/list'))).toMatchObject({ error: { code: -32601 } });
	});

	it('answers a batch, leaving out its notifications', async () => {
		const out = await handleBody(access, [req('ping', undefined, 1), { jsonrpc: '2.0', method: 'notifications/initialized' }, req('ping', undefined, 2)]);
		expect(out).toEqual([
			{ jsonrpc: '2.0', id: 1, result: {} },
			{ jsonrpc: '2.0', id: 2, result: {} }
		]);
		expect(await handleBody(access, [{ jsonrpc: '2.0', method: 'notifications/initialized' }])).toBeNull();
		expect(await handleBody(access, [])).toMatchObject({ error: { code: -32600 } });
	});

	it('refuses a batch longer than the limit, running none of it (#210)', async () => {
		const pings = (n: number) => Array.from({ length: n }, (_, i) => req('ping', undefined, i));
		expect(await handleBody(access, pings(MAX_BATCH))).toHaveLength(MAX_BATCH);
		expect(await handleBody(access, pings(MAX_BATCH + 1))).toMatchObject({ id: null, error: { code: -32600 } });
	});

	it('runs a batch one message after another, in order (#210)', async () => {
		const out = (await handleBody(access, [req('ping', undefined, 'a'), req('resources/list', undefined, 'b'), req('ping', undefined, 'c')])) as { id: string }[];
		expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('the request body (#210)', () => {
	const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request('https://waterline.example.com/mcp', { method: 'POST', body, headers });

	it('reads JSON', async () => {
		expect(await readJsonBody(post('{"jsonrpc":"2.0","id":1,"method":"ping"}'))).toEqual({ body: { jsonrpc: '2.0', id: 1, method: 'ping' } });
		expect(await readJsonBody(post('not json'))).toEqual({ error: 'invalid' });
	});

	it('refuses a body over the limit from its content-length, without reading it', async () => {
		const r = post('{}', { 'content-length': '5000' });
		expect(await readJsonBody(r, 1000)).toEqual({ error: 'too-large' });
		expect(r.bodyUsed).toBe(false);
	});

	it('stops reading a body that turns out longer than the limit', async () => {
		let sent = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(c) {
				sent++;
				c.enqueue(new Uint8Array(400).fill(32));
			}
		});
		const r = new Request('https://waterline.example.com/mcp', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
		expect(await readJsonBody(r, 1000)).toEqual({ error: 'too-large' });
		expect(sent).toBeLessThan(10);
	});
});

describe('tools', () => {
	it('lists every tool as read-only', async () => {
		const r = (await handleMessage(access, req('tools/list'))) as { result: { tools: { name: string; annotations: Record<string, boolean> }[] } };
		expect(r.result.tools.map((t) => t.name)).toContain('list_tanks');
		for (const t of r.result.tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	});

	it('returns data as JSON text and structured content', async () => {
		const r = (await call('list_tanks')) as { result: { content: { text: string }[]; structuredContent: unknown } };
		expect(JSON.parse(r.result.content[0].text)).toEqual({ tanks: [{ id: 't1' }] });
		expect(r.result.structuredContent).toEqual({ tanks: [{ id: 't1' }] });
	});

	it('returns Markdown as text, and a photo as an image', async () => {
		expect(await call('get_tank_summary', { tank_id: 't1' })).toMatchObject({ result: { content: [{ type: 'text', text: '# Riverbed 40' }] } });
		expect(await call('get_photo')).toMatchObject({
			result: { content: [{ type: 'image', mimeType: 'image/jpeg', data: Buffer.from('jpeg').toString('base64') }, { type: 'text', text: 'A photo' }] }
		});
	});

	it("tells the assistant what it got wrong, as the tool's result", async () => {
		expect(await call('get_tank_summary', { tank_id: 'nope' })).toMatchObject({
			result: { isError: true, content: [{ type: 'text', text: expect.stringContaining('No tank nope') }] }
		});
	});

	it('refuses a tool it does not have, and hides what broke', async () => {
		expect(await call('delete_tank')).toMatchObject({ error: { code: -32602, message: 'Unknown tool: delete_tank' } });
		const r = (await call('broken')) as { error: { code: number; message: string } };
		expect(r.error.code).toBe(-32603);
		expect(r.error.message).not.toContain('database');
	});
});
