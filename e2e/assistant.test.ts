import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('an AI assistant: a token from Settings reads the tank over MCP and the API, until revoked', async ({ page }, info) => {
	await newKeeperWithTank(page, `assistant-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a water test, for History
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Temperature', { exact: true }).fill('78');
	await page.getByLabel('Nitrate', { exact: true }).fill('10');
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByRole('button', { name: 'Save 3 readings' }).click();
	await expect(page.getByRole('status')).toContainText('Saved');

	// off until a token is made
	await open(page, '/settings');
	await expect(page.getByRole('link', { name: 'AI assistant Off' })).toBeVisible();
	const anon = await page.request.get('/api/v1/tanks');
	expect(anon.status()).toBe(401);

	await open(page, '/settings/assistant');
	await expect(page.getByText('No assistant connected')).toBeVisible();
	// at least one tank
	await page.getByRole('checkbox', { name: 'Riverbed 40' }).uncheck();
	await page.getByRole('button', { name: 'Create access token' }).click();
	await expect(page.getByText('✕ Pick at least one tank.')).toBeVisible();
	await page.getByLabel('Name').fill('Claude');
	await page.getByRole('checkbox', { name: 'Riverbed 40' }).check();
	await page.getByRole('button', { name: 'Create access token' }).click();
	await expect(page.getByText("Copy it now: it's shown only this once.")).toBeVisible();
	const token = (await page.locator('#made-token').textContent())!.trim();
	expect(token).toMatch(/^wl_[\w-]{40,}$/);
	await expect(page.locator('#tok-header')).toHaveText(`Authorization: Bearer ${token}`);
	// steps per app; Claude Code signs in by itself, so its command has no token
	await page.locator('summary', { hasText: 'Claude Code' }).click();
	await expect(page.locator('#how-code')).toHaveText(`claude mcp add --transport http waterline ${new URL(page.url()).origin}/mcp`);
	await page.locator('summary', { hasText: 'claude.ai' }).click();
	await expect(page.getByText('Settings › Connectors and choose Add custom connector')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Connected' }).getByRole('listitem').filter({ hasText: 'Claude' })).toContainText('Reads Riverbed 40');
	await expect(page.getByRole('region', { name: 'Connected' }).getByRole('listitem').filter({ hasText: 'Claude' })).toContainText('Not used yet');

	// MCP
	const headers = { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' };
	const rpc = async (method: string, params?: unknown) => {
		const res = await page.request.post('/mcp', { headers, data: { jsonrpc: '2.0', id: 1, method, params } });
		expect(res.status()).toBe(200);
		return (await res.json()).result;
	};
	expect((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })).protocolVersion).toBe('2025-06-18');
	const done = await page.request.post('/mcp', { headers, data: { jsonrpc: '2.0', method: 'notifications/initialized' } });
	expect(done.status()).toBe(202);
	const tools = (await rpc('tools/list')).tools.map((t: { name: string }) => t.name);
	expect(tools).toEqual(expect.arrayContaining(['list_tanks', 'get_tank_summary', 'get_readings', 'get_history', 'get_livestock', 'list_photos', 'get_photo']));
	const listed = await rpc('tools/call', { name: 'list_tanks', arguments: {} });
	expect(listed.structuredContent.tanks).toEqual([expect.objectContaining({ id: tankId, name: 'Riverbed 40', type: 'Planted' })]);
	const summary = await rpc('tools/call', { name: 'get_tank_summary', arguments: { tank_id: tankId } });
	expect(summary.content[0].text).toContain('# Riverbed 40: aquarium summary from Waterline');
	// a test's readings in the tank's order
	const history = await rpc('tools/call', { name: 'get_history', arguments: { tank_id: tankId } });
	expect(history.structuredContent.entries[0]).toMatchObject({ category: 'water_test', title: 'pH 6.8, Nitrate 10 ppm, Temperature 78 °F' });
	const other = await rpc('tools/call', { name: 'get_readings', arguments: { tank_id: 'not-a-tank' } });
	expect(other.isError).toBe(true);

	// the same over the JSON API
	const api = await page.request.get('/api/v1/tanks', { headers: { authorization: `Bearer ${token}` } });
	expect((await api.json()).tanks[0].name).toBe('Riverbed 40');
	const readings = await page.request.get(`/api/v1/tanks/${tankId}/readings?parameter=pH`, { headers: { authorization: `Bearer ${token}` } });
	expect((await readings.json()).parameters).toEqual([expect.objectContaining({ name: 'pH', latest: expect.objectContaining({ value: 6.8, status: '✓ OK' }), readings: [expect.objectContaining({ value: 6.8 })] })]);

	// the tables: rows over MCP, JSON and CSV over the API
	const rows = await rpc('tools/call', { name: 'get_reading_rows', arguments: { parameter: 'no3' } });
	expect(rows.structuredContent.rows).toEqual([expect.objectContaining({ tank: 'Riverbed 40', parameter: 'Nitrate', value: 10, unit: 'ppm' })]);
	const overview = await page.request.get('/api/v1/overview', { headers: { authorization: `Bearer ${token}` } });
	expect((await overview.json()).rows[0]).toMatchObject({ tank: 'Riverbed 40', last_tested: expect.any(String) });
	const csv = await page.request.get('/api/v1/readings?format=csv', { headers: { authorization: `Bearer ${token}` } });
	expect(csv.headers()['content-type']).toContain('text/csv');
	expect((await csv.text()).split('\r\n')[0]).toBe('tank,tank_id,date,time,parameter,key,value,unit,target_min,target_max,status');

	// used, then revoked: refused
	await open(page, '/settings/assistant');
	await expect(page.getByRole('region', { name: 'Connected' }).getByRole('listitem').filter({ hasText: 'Claude' })).toContainText('Last used Today');
	await page.getByRole('button', { name: 'Revoke Claude' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
	await expect(page.getByRole('status')).toContainText("Claude can't read your tanks any more");
	await expect(page.getByText('No assistant connected')).toBeVisible();
	const after = await page.request.post('/mcp', { headers, data: { jsonrpc: '2.0', id: 1, method: 'ping' } });
	expect(after.status()).toBe(401);
});

test('an assistant token works without scripts, and its tanks can be changed', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `assistant-plain-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/settings/assistant');
	await plain.getByLabel('Name').fill('Script');
	await plain.getByRole('button', { name: 'Create access token' }).click();
	await expect(plain.locator('#made-token')).toHaveText(/^wl_/);
	await plain.getByRole('link', { name: 'Tanks Script can read' }).click();
	await plain.locator('form[action="?/tanks"]').getByRole('checkbox', { name: 'Riverbed 40' }).uncheck();
	await plain.getByRole('button', { name: 'Save' }).click();
	await expect(plain.getByText('✕ Pick at least one tank, or revoke it.')).toBeVisible();
	await ctx.close();
});
