import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { newKeeperWithTank, open } from './helpers';

test('the account menu: your initials, your settings, and signing out', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `menu-${info.project.name}`);
	// the test sign-in names an account after its address
	const name = email.split('@')[0];
	const words = name.split(/[\s._-]+/).filter(Boolean);
	const initials = (words[0][0] + words[words.length - 1][0]).toUpperCase();

	await open(page, '/');
	const account = page.getByRole('button', { name: `Account: ${name}` });
	await expect(account).toHaveText(initials);
	await account.click();
	// the sidebar and the dashboard each have one; only the open menu counts
	const menu = page.locator(':popover-open');
	await expect(menu.getByText(email)).toBeVisible();
	await expect(menu.getByText(name, { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Server settings' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Account settings' }).click();
	await expect(page).toHaveURL('/settings#profile');
	// no Google photo: initials, and nothing to serve
	expect((await page.request.get('/avatar')).status()).toBe(404);

	// an admin also gets Server settings
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update users set is_admin = 1 where email = ?').run(email);
	db.close();
	await open(page, '/');
	await account.click();
	await expect(page.getByRole('link', { name: /^Server settings/ })).toBeVisible();

	// signing out, from the menu
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/signin/);
});

test('the account menu opens without scripts', async ({ page, browser }, info) => {
	const email = await newKeeperWithTank(page, `menu-plain-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/');
	await plain.getByRole('button', { name: `Account: ${email.split('@')[0]}` }).click();
	await expect(plain.getByRole('link', { name: 'Account settings' })).toBeVisible();
	await ctx.close();
});

test('the account menu is there before the first tank', async ({ page }, info) => {
	const email = `menu-new-${info.project.name}-${Date.now()}@example.com`;
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await expect(page.getByLabel('Tank name')).toBeVisible();
	await open(page, '/');
	await page.getByRole('button', { name: `Account: ${email.split('@')[0]}` }).click();
	await expect(page.locator(':popover-open').getByText(email)).toBeVisible();
});
