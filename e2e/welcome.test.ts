import AxeBuilder from '@axe-core/playwright';
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

	expect((await visitor.request.get('/sample')).status()).toBe(404);
	const setLanding = async (on: boolean, access = '') => {
		await open(page, '/settings/server#public-pages');
		const box = page.getByLabel(/Product homepage/);
		if (on) await box.check();
		else await box.uncheck();
		// the sample tank (#301) goes with it here: the same form, so one test switches both
		const sample = page.getByLabel(/Sample tank/);
		if (on) await sample.check();
		else await sample.uncheck();
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

		// #301: a sample tank to look around, from the homepage and sign-in, on a phone and a desktop
		await visitor.goto('/welcome');
		await visitor.getByRole('link', { name: 'Explore a sample tank' }).click();
		await expect(visitor).toHaveURL(/\/sample$/);
		for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
			const guest = await (await browser.newContext({ viewport: size })).newPage();
			await guest.goto('/sample');
			// WCAG 2.2 AA, in light and dark, as e2e/a11y.test.ts checks the app's screens
			for (const scheme of ['light', 'dark'] as const) {
				await guest.emulateMedia({ colorScheme: scheme });
				const { violations } = await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
				expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
			}
			// labelled as made up, and it stays in view as the page scrolls
			const label = guest.getByText('Sample tank · made-up data', { exact: true });
			await expect(label).toBeVisible();
			await guest.getByRole('heading', { name: 'Care log' }).scrollIntoViewIfNeeded();
			await expect(label).toBeInViewport();
			// an overview, a trend with care on it, a short history, a reminder and spending
			await expect(guest.getByRole('heading', { name: 'Latest readings' })).toBeVisible();
			await expect(guest.getByRole('heading', { name: 'Readings & events' })).toBeVisible();
			await expect(guest.getByText('Water changes', { exact: true }).first()).toBeVisible();
			await expect(guest.getByText(/Water change 25% · every 7 days/)).toBeVisible();
			await expect(guest.getByRole('heading', { name: 'Spending' })).toBeVisible();
			// nothing that only a real tank has: no copy, no download, no analytics, never indexed
			await expect(guest.getByRole('link', { name: /Copy summary|Download data/ })).toHaveCount(0);
			await expect(guest.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
			// the call to action: this server's sign-in or running your own, and it can be put away
			const cta = guest.getByRole('complementary', { name: 'Start your own log' });
			await expect(cta.getByRole('link', { name: 'Start your own log' })).toHaveAttribute('href', '/signin');
			await expect(cta.getByRole('link', { name: 'Run it yourself ↗' })).toHaveAttribute('href', 'https://github.com/Fiala06/waterline');
			await cta.getByRole('button', { name: 'Hide this' }).click();
			await expect(cta).toBeHidden();
			await guest.reload();
			await expect(guest.getByRole('complementary', { name: 'Start your own log' })).toBeHidden();
			await expect(label).toBeVisible();
			await guest.context().close();
		}
		// a deep link to a chart range, and the keyboard reaches the range links
		await visitor.goto('/sample?chart=90d#trends');
		await expect(visitor.getByRole('link', { name: '90 days' })).toHaveAttribute('aria-current', /.+/);
		await visitor.getByRole('link', { name: '30 days' }).focus();
		await visitor.keyboard.press('Enter');
		await expect(visitor).toHaveURL(/\/sample#trends$/);
		await visitor.goto('/signin');
		await expect(visitor.getByRole('link', { name: 'Explore a sample tank first' })).toHaveAttribute('href', '/sample');

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
	expect((await visitor.request.get('/sample')).status()).toBe(404);
});
