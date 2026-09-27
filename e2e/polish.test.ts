import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Regressions from the pre-launch review.

test('editing a test keeps exact readings and shows what they were', async ({ page }, info) => {
	await newKeeperWithTank(page, `edit-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('7.54');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('1 out of range');
	await page.getByRole('status').getByRole('link', { name: 'View' }).click();
	const detail = /\/entries\/test\/[^/]+$/;
	await expect(page).toHaveURL(detail);

	// 7.54 is over the 7.5 limit, so it isn't rounded to a value that looks in range
	const ph = page.locator('.row', { hasText: /^pH/ });
	await expect(ph).toContainText('7.54');
	await expect(ph).toContainText('✕ High');

	// only the note changes: the reading stays exactly as logged
	await page.getByRole('link', { name: 'Edit' }).click();
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByLabel('Note').fill('after topping off');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(detail);
	await expect(ph).toContainText('7.54');
	await expect(ph).toContainText('✕ High');

	// a changed reading remembers the old value
	await page.getByRole('link', { name: 'Edit' }).click();
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByLabel('pH', { exact: true }).fill('7.2');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(detail);
	await expect(ph).toContainText('7.2');
	await expect(ph).toContainText('was 7.54');

	// the edit screen can delete the entry (G6)
	await page.getByRole('link', { name: 'Edit' }).click();
	await page.locator('html[data-ready="true"]').waitFor();
	await expect(page.getByText('was 7.54')).toBeVisible();
	await page.getByRole('button', { name: 'Delete entry' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('status')).toContainText('Entry deleted');
});

test('deleting an entry opened from History goes back to History', async ({ page }, info) => {
	await newKeeperWithTank(page, `hist-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');

	await open(page, '/history');
	await page.getByRole('link', { name: /Water test · 1 reading/ }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/history/);
	await expect(page.getByRole('status')).toContainText('Entry deleted');
});

test('targets show saved switches before scripts load', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `targets-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/targets`);
	await expect(plain.getByLabel('Track pH', { exact: true })).toBeChecked();
	await expect(plain.getByLabel('pH maximum')).toBeVisible();
	await ctx.close();
});

test('impossible dates are refused, not a server error', async ({ page, baseURL }, info) => {
	await newKeeperWithTank(page, `dates-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	const field = await page.getByLabel('pH', { exact: true }).getAttribute('name');
	const res = await page.request.post(`/entries/test/new?tank=${tankId}`, {
		form: { date: '2026-13-45', time: '25:00', [field!]: '7' },
		headers: { origin: new URL(baseURL!).origin, 'x-sveltekit-action': 'true', accept: 'application/json' }
	});
	const body = await res.json();
	expect(body.type).toBe('failure');
	expect(body.data).toContain('Pick a valid date and time.');
});

test('responses carry security headers and refuse cross-site posts', async ({ request }) => {
	const res = await request.get('/signin');
	expect(res.headers()['x-frame-options']).toBe('DENY');
	expect(res.headers()['x-content-type-options']).toBe('nosniff');
	expect(res.headers()['referrer-policy']).toBe('same-origin');
	const post = await request.post('/settings?/save', { data: { theme: 'dark' }, headers: { origin: 'https://evil.example' } });
	expect(post.status()).toBe(403);
});

test("a page's headers stay small enough for a proxy in front", async ({ page }, info) => {
	// nginx (and Nginx Proxy Manager) answers 502 when a response's headers pass 4 KB
	await newKeeperWithTank(page, `headers-${info.project.name}`);
	for (const path of ['/', '/tasks', '/history']) {
		const res = await page.request.get(path);
		expect(res.status()).toBe(200);
		const headers = res.headersArray();
		expect(headers.reduce((n, h) => n + h.name.length + h.value.length + 4, 0)).toBeLessThan(2048);
		expect(headers.some((h) => h.name.toLowerCase() === 'link')).toBe(false);
		// the preloads are in the page instead
		expect(await res.text()).toMatch(/<link rel="modulepreload" href="[^"]+\.js">/);
	}
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
});

test('phones reach Charts and Photos from the dashboard', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'phone layout');
	await newKeeperWithTank(page, `nav-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('link', { name: 'Charts' })).toBeVisible();
	await page.getByRole('link', { name: 'Photos' }).click();
	await expect(page).toHaveURL(/\/photos/);
});

test('desktop tank switcher opens with the keyboard', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'desktop header');
	await newKeeperWithTank(page, `menu-${info.project.name}`);
	await page.keyboard.press('Control+k');
	const menu = page.getByRole('dialog', { name: 'Switch tank' });
	await expect(menu.getByPlaceholder('Search tanks…')).toBeFocused();
	await menu.getByPlaceholder('Search tanks…').fill('zzz');
	await expect(menu).toContainText('No tank matches');
	await menu.getByPlaceholder('Search tanks…').fill('river');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page).toHaveURL(/\?tank=/);
});

test('the dashboard shows what is in the tank and opens each list', async ({ page }, info) => {
	await newKeeperWithTank(page, `contents-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const section = page.locator('section', { has: page.getByRole('heading', { name: 'In the tank' }) });
	await expect(section.getByRole('link', { name: /Livestock/ })).toContainText('None added yet');
	await section.getByRole('link', { name: /Plants/ }).click();
	await expect(page).toHaveURL(new RegExp(`/tanks/${tankId}/plants$`));
});
