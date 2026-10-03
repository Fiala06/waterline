import { expect, test } from '@playwright/test';
import { linkIn, newKeeperWithTank, open, waitForMail } from './helpers';

// #27: the admin invites someone by email; the Accept link signs them in; People manages them.
test('invitations and People', async ({ page, browser }, info) => {
	// There's one local admin account, so run this in one project only.
	test.skip(info.project.name !== 'desktop', 'shares the single admin account');

	await page.goto('/signin?local');
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page).toHaveURL(/\/(setup)?$/);
	if (page.url().includes('/setup')) await page.getByRole('button', { name: /Skip/ }).click();

	// Server settings: Who can sign in has the new choice; People is a section with a sub-page
	await open(page, '/settings/server');
	await expect(page.locator('label', { hasText: 'Invited people only' })).toBeVisible();
	await page.locator('a.row', { hasText: 'People' }).click();
	await expect(page).toHaveURL(/\/settings\/server\/people$/);

	// Send an invitation: the email carries the Accept link
	const invitee = `invitee-${Date.now()}@example.com`;
	await page.getByLabel('Email').fill(invitee);
	await page.getByRole('button', { name: 'Send invite' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Invitation sent' })).toContainText(`✓ Invitation sent to ${invitee}`);
	await expect(page.getByLabel('Invite link')).toHaveValue(/\/invite\/[\w-]+$/);
	await expect(page.getByText('▲ Pending')).toBeVisible();
	const mail = await waitForMail(invitee, (m) => m.subject.includes('invited you to Waterline'));
	const link = linkIn(mail, '/invite/');

	// The invitee opens it in their own browser and accepts by signing in
	const them = await browser.newContext();
	const theirPage = await them.newPage();
	await theirPage.goto(link);
	await expect(theirPage.getByRole('heading', { name: "You're invited" })).toBeVisible();
	await expect(theirPage.getByText(invitee)).toBeVisible();
	await theirPage.getByRole('button', { name: /to accept$/ }).click();
	await expect(theirPage).toHaveURL(/\/setup$/);
	// used once: the link now says so
	await theirPage.goto(link);
	await expect(theirPage).toHaveURL(/\/$|\/setup$/);

	// People: they're on the server now, with Make admin, Sign out everywhere and Remove
	await open(page, '/settings/server/people');
	const row = page.locator('li.person', { hasText: invitee }).first();
	await expect(row).toContainText('Invited · joined');
	await expect(page.getByText('✓ Accepted').first()).toBeVisible();
	await row.getByRole('button', { name: 'Make admin' }).click();
	await expect(page.getByRole('status')).toContainText('is an admin');
	await expect(row.locator('.tag', { hasText: 'ADMIN' })).toBeVisible();
	await row.getByRole('button', { name: 'Remove admin' }).click();
	await expect(page.getByRole('status')).toContainText('is no longer an admin');

	// Sign out everywhere: their next request lands on the sign-in page
	await row.getByRole('button', { name: 'Sign out everywhere' }).click();
	await expect(page.getByRole('status')).toContainText('signed out everywhere');
	// a second later (the cookie is re-signed on every request; the sign-in time must not move with it)
	await theirPage.waitForTimeout(1100);
	await theirPage.goto('/setup');
	await expect(theirPage).toHaveURL(/\/signin/);
	await theirPage.goto('/setup');
	await expect(theirPage).toHaveURL(/\/signin/);

	// Remove the person: confirmation names what goes
	await row.getByRole('button', { name: 'Remove…' }).click();
	await expect(row.getByText(/Their account goes, with 0 tanks/)).toBeVisible();
	await row.getByRole('button', { name: 'Remove person' }).click();
	await expect(page.getByRole('status')).toContainText('removed with 0 tanks and 0 photos');
	await expect(page.locator('section[aria-labelledby="people-h"] li.person', { hasText: invitee })).toHaveCount(0);
	await expect(page.getByText('○ Revoked').first()).toBeVisible();
	await them.close();
});

// Someone not invited still signs in through the mock Google login in tests; the invitation page handles bad links.
test('an invitation link that is not one', async ({ page }, info) => {
	await newKeeperWithTank(page, `inv-bad-${info.project.name}`);
	await page.goto('/invite/not-a-real-token');
	await expect(page.getByRole('heading', { name: "That link isn't an invitation" })).toBeVisible();
});
