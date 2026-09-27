import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, waitForMail } from './helpers';

test('daily digest instead of individual emails', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `digest-${info.project.name}`);
	await open(page, '/settings');
	// settings save as soon as they change
	await page.locator('label', { hasText: 'Daily digest' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Notification settings saved');

	// With a digest, a bad reading doesn't send its own alert...
	const tankId = (await page.request.get('/tanks').then((r) => r.text())).match(/\/\?tank=([0-9a-f-]{36})/)![1];
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel(/^Nitrate /).fill('40');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('1 out of range');
	await expect(waitForMail(email, (m) => m.subject.startsWith('Nitrate is high'), 1200)).rejects.toThrow();

	// ...it shows up in the digest
	await page.request.post('/dev/notify');
	const digest = await waitForMail(email, (m) => m.subject.startsWith('Today:'));
	expect(digest.subject).toBe('Today: 1 reading out of range');
	expect(digest.text).toContain('✕ Nitrate 40 ppm');
});

test('server settings are admin only; test email via outbox', async ({ page }, info) => {
	// There's one local admin account, so run this in one project only.
	test.skip(info.project.name !== 'desktop', 'shares the single admin account');
	// A regular user gets a 404
	await newKeeperWithTank(page, `nonadmin-${info.project.name}`);
	const res = await page.request.get('/settings/server');
	expect(res.status()).toBe(404);
	await page.context().clearCookies();

	// The local admin account is the admin
	await open(page, '/signin?local');
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	if (page.url().includes('/setup')) {
		await page.getByRole('button', { name: /Skip/ }).click();
	}
	await open(page, '/settings');
	const adminInbox = `owner-${info.project.name}-${Date.now()}@example.com`;
	await page.getByLabel('Notification email').fill(adminInbox);
	await page.getByLabel('Notification email').press('Enter');
	await expect(page.getByRole('status')).toContainText('saved');

	await open(page, '/settings/server');
	await expect(page.getByText('Outbox mode')).toBeVisible();

	// Validation
	await page.locator('form[action="?/save"]').getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('✕ Enter your Mailgun API key.')).toBeVisible();

	// Fill Mailgun and send a test (outbox mode never calls Mailgun)
	await page.getByLabel('API key').fill('key-test');
	await page.getByLabel('Sending domain').fill('mg.example.com');
	await page.getByLabel('Sender').fill('Waterline <tanks@mg.example.com>');
	await page.getByRole('button', { name: 'Send test email' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Sent via' })).toContainText(`✓ Sent via the outbox to ${adminInbox}`);
	const mail = await waitForMail(adminInbox, (m) => m.subject === 'Waterline test email: delivery works');
	expect(mail.text).toContain('✓ Delivery works');

	await page.locator('form[action="?/save"]').getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('✓ Email settings saved')).toBeVisible();
	await open(page, '/settings/server');
	await expect(page.getByLabel('API key')).toHaveAttribute('placeholder', /saved/);
	await expect(page.getByLabel('Sending domain')).toHaveValue('mg.example.com');
});

test('changing the theme applies right away', async ({ page }, info) => {
	await newKeeperWithTank(page, `theme-${info.project.name}`);
	await open(page, '/settings');
	const html = page.locator('html');
	await page.locator('#theme label', { hasText: 'Light' }).click();
	await expect(html).toHaveAttribute('data-theme', 'light');
	await page.locator('#theme label', { hasText: 'Dark' }).click();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await page.locator('#theme label', { hasText: 'System' }).click();
	await expect(html).not.toHaveAttribute('data-theme', /.+/);
});
