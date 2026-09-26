import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('local admin login rejects a wrong password', async ({ page }) => {
	await page.goto('/signin');
	await page.getByRole('button', { name: 'Use local admin login' }).click();
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('not the password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page.getByRole('alert')).toContainText('Wrong username or password.');
});

test('local admin login signs in', async ({ page }) => {
	await page.goto('/signin');
	await page.getByRole('button', { name: 'Use local admin login' }).click();
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page).toHaveURL(/\/(setup)?$/);
});
