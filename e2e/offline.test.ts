import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('manifest and icons are served', async ({ request }) => {
	const m = await (await request.get('/manifest.webmanifest')).json();
	expect(m).toMatchObject({ name: 'Waterline', display: 'standalone', background_color: '#0c1a1f', theme_color: '#0c1a1f' });
	expect(m.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable');
	for (const i of m.icons) expect((await request.get(i.src)).headers()['content-type']).toBe('image/png');
	expect((await request.get('/service-worker.js')).ok()).toBe(true);
});

test('logging offline saves on the device and syncs later', async ({ page, context }, info) => {
	await newKeeperWithTank(page, `offline-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// Let the service worker install and take control.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await open(page, `/?tank=${tankId}`);
	await open(page, `/entries/test/new?tank=${tankId}`);

	await context.setOffline(true);
	await page.getByLabel('Nitrate', { exact: true }).fill('15');
	await page.getByLabel('pH', { exact: true }).fill('7.1');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByText("Saved on this phone. It'll sync when you're back online.")).toBeVisible();
	await expect(page.getByText('Offline · 1 entry waiting')).toBeVisible();
	await expect(page.getByText('▲ Waiting to sync')).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByText('✓ Synced 1 entry')).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText('▲ Waiting to sync')).toHaveCount(0);
	await open(page, '/history');
	// Exactly one row: replays can't duplicate it (clientId dedupe)
	await expect(page.locator('a.row', { hasText: 'Water test · 2 readings' })).toHaveCount(1);
});
