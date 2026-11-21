import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, tankTitle } from './helpers';

// #303: a keeper deletes their own account from Settings › Data
test('delete your account: what goes, the email typed out, then a clean start', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `leaving-${info.project.name}`);
	await open(page, '/settings#data');
	await page.getByRole('link', { name: /Delete account/ }).click();
	await expect(page).toHaveURL('/settings/delete-account');
	await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
	await expect(page.getByText('Your 1 tank')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Download a full backup' })).toHaveAttribute('href', '/settings/export');

	// the wrong address: nothing happens
	await page.getByLabel(/To confirm, type your email address/).fill('someone@example.com');
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page.getByRole('alert')).toContainText('Type your email address exactly as it is shown.');
	await open(page, '/');
	await expect(tankTitle(page, 'Riverbed 40')).toBeVisible();

	await open(page, '/settings/delete-account');
	await page.getByLabel(/To confirm, type your email address/).fill(email);
	await page.getByRole('button', { name: 'Delete my account' }).click();
	await expect(page).toHaveURL(/\/signin\?deleted=1/);
	await expect(page.getByRole('status')).toContainText('Your account and everything in it were deleted.');

	// signing in again starts a new, empty account
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await expect(page.getByRole('button', { name: 'Continue to first tank' })).toBeVisible();
});
