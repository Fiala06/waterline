import { expect, test, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { newKeeperWithTank, open } from './helpers';

// An app like claude.ai connecting by signing in, as the MCP spec describes:
// discover, register, send the keeper to sign in and allow, swap the code
// (with PKCE) for tokens, call /mcp, refresh.
let CALLBACK = '';
let server: Server;
let last: URLSearchParams | null = null;

// the app's callback: a server on this computer, as a desktop app would have
test.beforeAll(async () => {
	server = createServer((req, res) => {
		const u = new URL(req.url ?? '/', 'http://127.0.0.1');
		// not the browser's /favicon.ico after it
		if (u.pathname === '/callback') last = u.searchParams;
		res.end('ok');
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	CALLBACK = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
});
test.afterAll(() => server.close());

/** Follows the consent page to the app's callback, and returns the query it got. */
async function callbackQuery(page: Page, go: () => Promise<unknown>) {
	last = null;
	await Promise.all([page.waitForURL((u) => u.href.startsWith(CALLBACK)), go()]);
	expect(last).not.toBeNull();
	return last!;
}

test('an app connects by signing in: register, allow, tokens, refresh, disconnect', async ({ page }, info) => {
	await newKeeperWithTank(page, `oauth-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = new URL(page.url()).origin;
	const api = page.request;

	// without a token, /mcp says where to learn how to sign in
	const first = await api.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'ping' } });
	expect(first.status()).toBe(401);
	const challenge = first.headers()['www-authenticate'];
	expect(challenge).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);

	// discovery
	const resource = await (await api.get('/.well-known/oauth-protected-resource/mcp')).json();
	expect(resource).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base] });
	const meta = await (await api.get('/.well-known/oauth-authorization-server')).json();
	expect(meta).toMatchObject({ issuer: base, code_challenge_methods_supported: ['S256'], registration_endpoint: `${base}/oauth/register` });

	// registration
	const bad = await api.post('/oauth/register', { data: { redirect_uris: ['http://evil.example/cb'] } });
	expect((await bad.json()).error).toBe('invalid_redirect_uri');
	const reg = await api.post('/oauth/register', { data: { client_name: 'Test Assistant', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' } });
	expect(reg.status()).toBe(201);
	const client = await reg.json();
	expect(client.client_id).toMatch(/^wlc_/);

	// the keeper signs in (already) and allows it, for the tank
	const verifier = randomBytes(32).toString('base64url');
	const authorize = new URL('/oauth/authorize', base);
	for (const [k, v] of Object.entries({
		response_type: 'code',
		client_id: client.client_id,
		redirect_uri: CALLBACK,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
		state: 'xyz',
		scope: 'read',
		resource: `${base}/mcp`
	}))
		authorize.searchParams.set(k, v);
	await open(page, authorize.pathname + authorize.search);
	await expect(page.getByRole('heading', { name: 'Connect Test Assistant to Waterline?' })).toBeVisible();
	await expect(page.getByText(new URL(CALLBACK).host)).toBeVisible();
	// at least one tank
	await page.getByRole('checkbox', { name: 'Riverbed 40' }).uncheck();
	await page.getByRole('button', { name: 'Allow' }).click();
	await expect(page.getByText('✕ Pick at least one tank.')).toBeVisible();
	await page.getByRole('checkbox', { name: 'Riverbed 40' }).check();
	const q = await callbackQuery(page, () => page.getByRole('button', { name: 'Allow' }).click());
	expect(q.get('state')).toBe('xyz');
	expect(q.get('iss')).toBe(base);
	const code = q.get('code')!;

	// the code, with the wrong verifier, then the right one; then never again
	const token = (form: Record<string, string>) => api.post('/oauth/token', { form });
	const wrong = await token({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: 'x'.repeat(43) });
	expect((await wrong.json()).error).toBe('invalid_grant');
	const got = await token({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier });
	expect(got.status()).toBe(200);
	const tokens = await got.json();
	expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read' });
	const again = await token({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier });
	expect((await again.json()).error).toBe('invalid_grant');

	// the access token reads the tank over MCP
	const call = (access: string) =>
		api.post('/mcp', {
			headers: { authorization: `Bearer ${access}` },
			data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_tanks', arguments: {} } }
		});
	const listed = await call(tokens.access_token);
	expect((await listed.json()).result.structuredContent.tanks).toEqual([expect.objectContaining({ id: tankId, name: 'Riverbed 40' })]);

	// refresh: new tokens, and the old ones stop working
	const renewed = await (await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id })).json();
	expect(renewed.access_token).not.toBe(tokens.access_token);
	expect((await call(tokens.access_token)).status()).toBe(401);
	expect((await call(renewed.access_token)).status()).toBe(200);
	const stale = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
	expect((await stale.json()).error).toBe('invalid_grant');

	// in Settings, as connected by signing in; disconnecting it ends its access
	await open(page, '/settings/assistant');
	const row = page.getByRole('listitem').filter({ hasText: 'Test Assistant' });
	await expect(row).toContainText('Connected by signing in');
	await expect(row).toContainText('Reads Riverbed 40');
	await page.getByRole('button', { name: 'Revoke Test Assistant' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
	await expect(page.getByText('No assistant connected')).toBeVisible();
	expect((await call(renewed.access_token)).status()).toBe(401);
	const gone = await token({ grant_type: 'refresh_token', refresh_token: renewed.refresh_token, client_id: client.client_id });
	expect((await gone.json()).error).toBe('invalid_grant');
});

test('the consent page: Cancel tells the app, and a bad request never leaves Waterline', async ({ page }, info) => {
	await newKeeperWithTank(page, `oauth-cancel-${info.project.name}`);
	const base = new URL(page.url()).origin;
	const client = await (await page.request.post('/oauth/register', { data: { client_name: 'Other App', redirect_uris: [CALLBACK] } })).json();
	const url = (extra: Record<string, string>) =>
		'/oauth/authorize?' +
		new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', state: 's1', ...extra });

	await open(page, url({}));
	const q = await callbackQuery(page, () => page.getByRole('button', { name: 'Cancel' }).click());
	expect(q.get('error')).toBe('access_denied');
	expect(q.get('state')).toBe('s1');

	// an address the app didn't register: shown here, not followed
	await open(page, url({ redirect_uri: 'https://evil.example/cb' }));
	await expect(page.getByRole('heading', { name: "Can't connect" })).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`^${base}/oauth/authorize`));
	// no PKCE: back to the app with an error
	const noPkce = await callbackQuery(page, () => page.goto(url({ code_challenge_method: 'plain' })));
	expect(noPkce.get('error')).toBe('invalid_request');
});
