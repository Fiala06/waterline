import { expect, test } from './test';
import { open } from './helpers';

// #300: the product homepage, opt-in in Server settings: signed-out visitors to / see what
// Waterline is, with Sign in, self-hosting and the admin's own words on who can join
test('the product homepage: off by default, then on for signed-out visitors, and discoverable', async ({ page, browser }, info) => {
	// one local admin account, and a server-wide switch: one project only, switched off again at the end
	test.skip(info.project.name !== 'desktop', 'shares the single admin account and a server-wide setting');
	const visitor = await (await browser.newContext()).newPage();
	expect((await visitor.request.get('/welcome')).status()).toBe(404);

	await page.goto('/signin?local');
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page).toHaveURL(/\/(setup)?$/);
	if (page.url().includes('/setup')) await page.getByRole('button', { name: /Skip/ }).click();

	const setLanding = async (on: boolean, access = '') => {
		await open(page, '/settings/server#public-pages');
		const box = page.getByLabel(/Product homepage/);
		if (on) await box.check();
		else await box.uncheck();
		await page.getByLabel(/Who can join/).fill(access);
		const saved = page.waitForResponse((r) => r.url().includes('/settings/server') && r.request().method() === 'POST');
		await page.locator('form[aria-labelledby="public-h"]').getByRole('button', { name: /^Save/ }).click();
		await saved;
	};
	try {
		await setLanding(true, 'Free while in beta. Ask for an invitation in the forum thread.');

		// signed out: / is the homepage, with Sign in, self-hosting and the admin's words
		await visitor.goto('/');
		await expect(visitor).toHaveURL(/\/welcome$/);
		await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Know what your tank is doing.');
		await expect(visitor.getByText('Free while in beta. Ask for an invitation in the forum thread.').first()).toBeVisible();
		await expect(visitor.getByRole('img', { name: /Waterline on a phone/ })).toBeVisible();
		await expect(visitor.getByRole('link', { name: 'Self-host it ↗' })).toHaveAttribute('href', 'https://github.com/Fiala06/waterline');
		await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/welcome$/);
		await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/screenshots\/share-card\.png$/);
		expect((await visitor.request.get('/screenshots/share-card.png')).headers()['content-type']).toBe('image/png');
		// the keyboard reaches Sign in
		await visitor.keyboard.press('Tab');
		await visitor.keyboard.press('Tab');
		await expect(visitor.locator(':focus')).toHaveText('Sign in');
		await visitor.getByRole('link', { name: 'Sign in' }).first().click();
		await expect(visitor).toHaveURL(/\/signin$/);
		// a deep link still goes to sign-in, and comes back after
		await visitor.goto('/history');
		await expect(visitor).toHaveURL(/\/signin\?redirectTo=%2Fhistory$/);

		const robots = await (await visitor.request.get('/robots.txt')).text();
		expect(robots).toContain('Allow: /welcome$');
		expect(robots).toContain('Disallow: /');

		// signed in: / is the app; the homepage offers to open it
		await open(page, '/');
		await expect(page).not.toHaveURL(/\/welcome/);
		await open(page, '/welcome');
		await expect(page.getByRole('link', { name: 'Open Waterline' }).first()).toHaveAttribute('href', '/');
	} finally {
		await setLanding(false);
	}
	await visitor.goto('/');
	await expect(visitor).toHaveURL(/\/signin/);
	expect(await (await visitor.request.get('/robots.txt')).text()).not.toContain('/welcome');
});
