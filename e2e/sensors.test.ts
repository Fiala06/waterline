import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #19: a sensor token posts readings, which stay apart from tests and show as Live.
test('sensor readings over the API', async ({ page }, info) => {
	await newKeeperWithTank(page, `sensor-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a hand-logged test, so the chart has a line of its own
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Temperature', { exact: true }).fill('78');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	// a sensor token
	await open(page, '/settings/sensors');
	await expect(page.getByText('No sensor connected')).toBeVisible();
	await page.getByLabel('Device').fill('ESPHome');
	await page.getByRole('button', { name: 'Create sensor token' }).click();
	await expect(page.getByText("Copy it now: it's shown only this once.")).toBeVisible();
	const token = (await page.locator('#made-token').textContent())!.trim();
	expect(token).toMatch(/^wls_[\w-]{40,}$/);

	// it may add readings, in °F too, and nothing else
	const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	const one = await page.request.post(`/api/v1/tanks/${tankId}/readings`, { headers, data: { parameter: 'temp', value: 77, unit: '°F' } });
	expect(one.status()).toBe(200);
	expect((await one.json()).results[0]).toMatchObject({ ok: true, stored: true, parameter: 'temp' });
	const again = await page.request.post(`/api/v1/tanks/${tankId}/readings`, { headers, data: { readings: [{ parameter: 'temp', value: 25.2, unit: '°C' }, { parameter: 'salinity', value: 1.025 }] } });
	expect(again.status()).toBe(207);
	const r = (await again.json()).results;
	expect(r[0]).toMatchObject({ ok: true, stored: false }); // within a minute of the last one
	expect(r[1].ok).toBe(false);
	expect((await page.request.get('/api/v1/tanks', { headers: { authorization: `Bearer ${token}` } })).status()).toBe(401);
	expect((await page.request.post(`/api/v1/tanks/${tankId}/readings`, { headers: { 'content-type': 'application/json' }, data: { parameter: 'temp', value: 1 } })).status()).toBe(401);

	// Live on the tank and on Charts; the hand-logged test is still the reading
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText(/● Live 77 °F/).first()).toBeVisible();
	await open(page, `/charts?tank=${tankId}`);
	await expect(page.locator('.stat.live')).toContainText('77 °F');
	await expect(page.locator('.stat.live')).toContainText('ESPHome');
	await expect(page.locator('.stat').filter({ hasText: 'Latest' })).toContainText('78');

	// Settings shows what came in; Revoke cuts it off
	await open(page, '/settings/sensors');
	await expect(page.getByText(/Riverbed 40 · 1 reading/)).toBeVisible();

	// On the public page, the sensor's readings are the thin line under the tests (readings on)
	const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
	const more = await page.request.post(`/api/v1/tanks/${tankId}/readings`, { headers, data: { readings: [{ parameter: 'temp', value: 25.4, unit: '°C', at: hoursAgo(3) }, { parameter: 'temp', value: 25.6, unit: '°C', at: hoursAgo(2) }] } });
	expect(more.status()).toBe(200);
	const earlier = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/entries/test/new?tank=${tankId}&date=${earlier}&time=18:00`);
	await page.getByLabel('Temperature', { exact: true }).fill('77');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	const slug = `sensor-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('URL').fill(slug);
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	await page.goto(`/t/${slug}`);
	const chart = page.locator('section.chart');
	await expect(chart.locator('svg polyline.sensor')).toHaveCount(1);
	await expect(chart.locator('.legend')).toContainText('Sensor');

	await open(page, '/settings/sensors');
	await page.getByRole('button', { name: 'Revoke ESPHome' }).click();
	await page.getByRole('button', { name: 'Revoke', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText("ESPHome can't send readings any more");
	expect((await page.request.post(`/api/v1/tanks/${tankId}/readings`, { headers, data: { parameter: 'temp', value: 25 } })).status()).toBe(401);
});
