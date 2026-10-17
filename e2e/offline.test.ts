import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('manifest and icons are served', async ({ request }) => {
	const m = await (await request.get('/manifest.webmanifest')).json();
	expect(m).toMatchObject({ name: 'Waterline', display: 'standalone', background_color: '#161514', theme_color: '#161514' });
	expect(m.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable');
	for (const i of m.icons) expect((await request.get(i.src)).headers()['content-type']).toBe('image/png');
	// installed-app polish (#111): a stable identity, shortcuts to safe pages, screenshots for the install sheet
	expect(m.id).toBe('/');
	expect(m.shortcuts.map((s: { name: string }) => s.name)).toEqual(['Log water test', 'Log water change', 'Tasks', 'Photos']);
	for (const s of m.shortcuts) {
		expect(s.url.startsWith('/')).toBe(true);
		for (const i of s.icons) expect((await request.get(i.src)).headers()['content-type']).toBe('image/png');
	}
	expect(m.screenshots.map((s: { form_factor: string }) => s.form_factor)).toEqual(expect.arrayContaining(['narrow', 'wide']));
	for (const s of m.screenshots) expect((await request.get(s.src)).headers()['content-type']).toBe('image/png');
	expect((await request.get('/service-worker.js')).ok()).toBe(true);
});

test('logging offline saves on the device and syncs later', async ({ page, context }, info) => {
	await newKeeperWithTank(page, `offline-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// Let the service worker install and take control.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await open(page, `/?tank=${tankId}`);
	await open(page, `/entries/test/new?tank=${tankId}`);
	// pages are cached under this version's name, so an update never serves the last one's (#114)
	const names = await page.evaluate(() => caches.keys());
	expect(names.some((n) => n.startsWith('pages-') && n !== 'pages-v1')).toBe(true);
	expect(names).not.toContain('pages-v1');

	await context.setOffline(true);
	await page.getByLabel('Nitrate', { exact: true }).fill('15');
	await page.getByLabel('pH', { exact: true }).fill('7.1');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByText("You're offline. Saved, and it'll sync when you're back on dry land.")).toBeVisible();
	await expect(page.getByText('Offline · 1 entry waiting')).toBeVisible();
	await expect(page.getByText('▲ Waiting to sync')).toBeVisible();

	await context.setOffline(false);
	await expect(page.getByText('✓ Synced 1 entry')).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText('▲ Waiting to sync')).toHaveCount(0);
	await open(page, '/history');
	// Exactly one row: replays can't duplicate it (clientId dedupe)
	await expect(page.locator('a.row', { hasText: 'Water test · 2 readings' })).toHaveCount(1);
});

// #108: what's kept on the device for offline use belongs to one person, and can be removed.
test('offline data stays with one person, and can be removed from the device', async ({ page, context }, info) => {
	await newKeeperWithTank(page, `forget-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await page.evaluate(() => navigator.serviceWorker.ready);
	await open(page, `/?tank=${tankId}`);
	await open(page, `/entries/test/new?tank=${tankId}`);
	const pages = () => page.evaluate(async () => (await Promise.all((await caches.keys()).filter((k) => k.startsWith('pages-')).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
	await expect.poll(pages).toBeGreaterThan(0);

	// a queued entry syncs only as the person who logged it
	const origin = new URL(page.url()).origin;
	const foreign = await page.request.post(`/entries/test/new?tank=${tankId}`, {
		headers: { origin, 'x-sveltekit-action': 'true', 'x-waterline-sync': '1', 'x-waterline-user': 'someone-else' },
		multipart: { date: '2026-01-01', time: '09:00' }
	});
	expect(foreign.status()).toBe(409);

	// someone else signed in on this device: the last person's pages go
	await page.evaluate(async () => (await navigator.serviceWorker.ready).active!.postMessage({ type: 'user', id: 'someone-else' }));
	await expect.poll(pages).toBe(0);

	// Settings › Data: Remove, asking first while an entry waits to sync
	// (opened again online: the switch above took the last copies). The first load says who's
	// signed in, which clears what "someone-else" left; wait for that before keeping pages again
	await open(page, `/?tank=${tankId}`);
	await expect
		.poll(() => page.evaluate(async () => (await (await caches.open('owner-v1')).match('/owner'))?.text()))
		.not.toBe('someone-else');
	await open(page, '/settings');
	await open(page, `/?tank=${tankId}`);
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect.poll(pages).toBeGreaterThanOrEqual(3);
	await context.setOffline(true);
	await page.getByLabel('pH', { exact: true }).fill('7.1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByText('Offline · 1 entry waiting')).toBeVisible();
	// the app goes on to the dashboard after saving; let it get there first
	await page.waitForURL((u) => u.pathname === '/');
	await page.goto('/settings');
	await expect(page.getByText('Offline data on this device')).toBeVisible();
	await page.getByRole('button', { name: 'Remove offline data' }).click();
	await expect(page.getByText("▲ 1 entry hasn't synced yet and will be lost.")).toBeVisible();
	await page.getByRole('button', { name: 'Remove anyway offline data' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Offline data removed' })).toBeVisible();
	expect(await pages()).toBe(0);
	await context.setOffline(false);
	await expect(page.getByText(/entry waiting/)).toHaveCount(0);
});

test('a session ended elsewhere clears the pages kept for it on the next visit', async ({ page, context }, info) => {
	await newKeeperWithTank(page, `revoked-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await page.evaluate(() => navigator.serviceWorker.ready);
	await open(page, `/?tank=${tankId}`);
	await open(page, '/history');
	const pages = () => page.evaluate(async () => (await Promise.all((await caches.keys()).filter((k) => k.startsWith('pages-')).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
	await expect.poll(pages).toBeGreaterThan(0);
	// the server no longer knows this session
	await context.clearCookies();
	await page.goto('/history');
	await expect(page).toHaveURL(/\/signin/);
	await expect.poll(pages).toBe(0);
});
