import { expect, test } from './test';
import { open } from './helpers';

// #302: About this server, for anyone, linked from sign-in and Settings: what it keeps, the services
// it uses, and the admin's own words on who runs it, a private contact and its terms
test('about this server: signed out, linked from sign-in, with what the admin writes', async ({ page, browser }, info) => {
	test.skip(info.project.name !== 'desktop', 'shares the single admin account and server-wide text');
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto('/signin');
	await visitor.getByRole('link', { name: /About this server/ }).click();
	await expect(visitor).toHaveURL(/\/about$/);
	await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('About this server');
	await expect(visitor.getByRole('region', { name: 'Services this server uses' })).toContainText('ntfy');
	await expect(visitor.getByRole('region', { name: 'Get help or report a problem' })).toContainText('never include private links, tokens, photos, receipts or account details');

	// the admin writes who runs it, a private contact and the terms
	await page.goto('/signin?local');
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page).toHaveURL(/\/(setup)?$/);
	if (page.url().includes('/setup')) await page.getByRole('button', { name: /Skip/ }).click();
	const save = async (op: string, contact: string, terms: string) => {
		await open(page, '/settings/server#about-server');
		await page.getByLabel(/Who runs it/).fill(op);
		await page.getByLabel(/Private contact/).fill(contact);
		await page.getByLabel(/Terms and retention/).fill(terms);
		const saved = page.waitForResponse((r) => r.url().includes('saveAbout'));
		await page.locator('#about-server').getByRole('button', { name: 'Save' }).click();
		await saved;
	};
	try {
		await save('Run by the forum’s admin, on a home server.', 'help@example.com', 'Free during the beta.\n\nBackups nightly, kept 14 days.');
		await visitor.reload();
		await expect(visitor.getByText('Run by the forum’s admin, on a home server.')).toBeVisible();
		await expect(visitor.getByRole('link', { name: 'help@example.com' }).first()).toHaveAttribute('href', 'mailto:help@example.com');
		const terms = visitor.getByRole('region', { name: 'Terms and retention' });
		await expect(terms).toContainText('Backups nightly, kept 14 days.');
		await expect(terms).toContainText(/Last changed \w+ \d+, \d{4}/);

		// and from Settings, for someone signed in
		await open(page, '/settings');
		await page.getByRole('link', { name: /About this server/ }).click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.getByRole('link', { name: 'Back to Waterline' })).toBeVisible();
	} finally {
		await save('', '', '');
	}
	await visitor.reload();
	await expect(visitor.getByRole('region', { name: 'Terms and retention' })).toHaveCount(0);
	await expect(visitor.getByText('This server is run by its owner, who decides who can use it.')).toBeVisible();
});
