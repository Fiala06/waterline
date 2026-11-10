import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

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

// #241: the worker keeps thumbnails for offline use, and leaves full-size photos to the browser.
test('only thumbnails are kept on the device, not every photo opened at full size', async ({ page }, info) => {
	await newKeeperWithTank(page, `media-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/event/new?tank=${tankId}&category=note`);
	await page.getByLabel('Note').fill('Trimmed the rotala');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save note' }).click();
	await expect(page.getByRole('status')).toContainText('Note saved');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await page.evaluate(async () => {
		// wait for the worker to be the one answering this page
		if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
	});
	await open(page, '/photos');
	const photoId = (await page.locator('a.tile').first().getAttribute('href'))!.split('/').pop()!.split('?')[0];
	// the photo at both sizes, as the viewer and the lists ask for it
	const sizes = await page.evaluate(async (id) => {
		const full = await fetch(`/media/${id}`);
		const thumb = await fetch(`/media/${id}?size=thumb`);
		return [full.ok, thumb.ok];
	}, photoId);
	expect(sizes).toEqual([true, true]);
	const kept = () => page.evaluate(async () => (await (await caches.open('media-v1')).keys()).map((r) => new URL(r.url).search));
	await expect.poll(kept).toContain('?size=thumb');
	expect((await kept()).every((q) => q === '?size=thumb')).toBe(true);
});

// #224: Wi-Fi up, but no way through to the server. The browser still says it's online.
test('an entry that never reaches the server is kept on the device and syncs later', async ({ page }, info) => {
	await newKeeperWithTank(page, `unreachable-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	// the post dies on the way; everything else still works
	let lost = 0;
	const dead = (r: import('@playwright/test').Route) => (r.request().method() === 'POST' ? (lost++, r.abort('connectionfailed')) : r.fallback());
	await page.route('**/entries/test/new**', dead);
	await page.getByLabel('pH', { exact: true }).fill('7.1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByText("Waterline couldn't be reached. Saved on this device, and it'll sync when it can.")).toBeVisible();
	await expect(page.getByText('Something went wrong')).toHaveCount(0);
	await expect(page.getByText('1 entry waiting')).toBeVisible();

	// the app tries to sync as soon as it's back on the dashboard, and that is lost on the way too
	await expect.poll(() => lost).toBe(2);
	await expect(page.getByText('1 entry waiting')).toBeVisible();

	// the way through is back: the next time the app is looked at, it syncs
	await page.unroute('**/entries/test/new**', dead);
	await page.reload();
	await expect(page.getByText('✓ Synced 1 entry')).toBeVisible({ timeout: 10_000 });
	await open(page, '/history');
	await expect(page.locator('a.row', { hasText: 'Water test · 1 reading' })).toHaveCount(1);
});

// #225: a failure that passes by itself is tried again; one that stands is shown on every page.
test('sync waits out a passing failure, and shows an entry the server refused wherever you are', async ({ page }, info) => {
	await newKeeperWithTank(page, `refused-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	let answer: 'dead' | 'proxy' | 'refuse' | 'through' = 'dead';
	let posts = 0;
	await page.route('**/entries/test/new**', (r) => {
		if (r.request().method() !== 'POST' || answer === 'through') return r.fallback();
		posts++;
		if (answer === 'dead') return r.abort('connectionfailed');
		if (answer === 'proxy') return r.fulfill({ status: 502, contentType: 'text/html', body: '<h1>502 Bad Gateway</h1>' });
		return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ type: 'failure', status: 400, data: '[{}]' }) });
	});
	await page.getByLabel('pH', { exact: true }).fill('6.9');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByText('1 entry waiting')).toBeVisible();
	// the form's post, then the sync the dashboard tries on opening: both lost on the way
	await expect.poll(() => posts).toBe(2);
	const unsynced = page.getByRole('status', { name: "Entries that couldn't sync" });

	// a proxy answering for a server that's restarting: still waiting, not given up on
	answer = 'proxy';
	const tried = page.waitForResponse((r) => r.status() === 502);
	await page.reload();
	await tried;
	await expect(page.getByText('1 entry waiting')).toBeVisible();
	await expect(unsynced).toHaveCount(0);

	// the server says no: the entry is shown with Retry and Discard, on a page of no tank too
	answer = 'refuse';
	await page.reload();
	await expect(unsynced).toContainText("✕ 1 entry couldn't sync");
	await expect(unsynced).toContainText("The server couldn't save this entry.");
	await open(page, '/settings');
	await expect(unsynced).toContainText('Water test · 1 reading');

	// Retry sends it again
	answer = 'through';
	await unsynced.getByRole('button', { name: /^Retry/ }).click();
	await expect(page.getByText('✓ Synced')).toBeVisible();
	await expect(unsynced).toHaveCount(0);
	await open(page, '/history');
	await expect(page.locator('a.row', { hasText: 'Water test · 1 reading' })).toHaveCount(1);
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
