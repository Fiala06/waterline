import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
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
	// and really signed out
	await page.goto('/');
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

/** A photo with metadata a browser would upload as it is (under 1024px, so it isn't shrunk first). */
const photo = (color: string) =>
	sharp({ create: { width: 600, height: 400, channels: 3, background: color } })
		.withMetadata({ exif: { IFD0: { Artist: 'Someone' } } })
		.jpeg()
		.toBuffer();

test('your own photo: upload one, go back to the Google photo, or show initials', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `photo-${info.project.name}`);
	const name = email.split('@')[0];
	const account = page.getByRole('button', { name: `Account: ${name}` });

	await open(page, '/settings');
	await expect(page.getByText('Your initials')).toBeVisible();
	await page.locator('#photo-file').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await photo('#c9763a') });
	await expect(page.getByText('Preview')).toBeVisible();
	await page.getByRole('button', { name: 'Save photo' }).click();
	await expect(page.getByText('Your own photo')).toBeVisible();
	// on a phone the account menu is on the dashboard
	await open(page, '/');
	await expect(account.locator('img')).toBeVisible();
	// kept small and square, without what the file said about itself
	const own = await page.request.get('/avatar');
	expect(own.status()).toBe(200);
	const meta = await sharp(await own.body()).metadata();
	expect(meta).toMatchObject({ width: 192, height: 192 });
	expect(meta.exif).toBeUndefined();

	// not a photo
	await open(page, '/settings');
	await page.locator('#photo-file').setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a photo') });
	await page.getByRole('button', { name: 'Save photo' }).click();
	await expect(page.getByRole('alert')).toHaveText("✕ That file couldn't be read as a photo.");
	await page.getByRole('button', { name: 'Cancel' }).click();

	// a Google account can go back to its Google photo
	const db = new Database('.e2e-data/waterline.db');
	const { id } = db.prepare('select id from users where email = ?').get(email) as { id: string };
	mkdirSync('.e2e-data/avatars', { recursive: true });
	writeFileSync(`.e2e-data/avatars/${id}.jpg`, await sharp(await photo('#2a8c84')).resize(192, 192).jpeg().toBuffer());
	db.prepare('update users set avatar_at = ? where id = ?').run(new Date().toISOString(), id);
	db.close();
	await open(page, '/settings');
	await page.getByRole('button', { name: 'Use my Google photo' }).click();
	await expect(page.getByText('From your Google account')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Use my Google photo' })).toHaveCount(0);
	const { dominant } = await sharp(await (await page.request.get('/avatar')).body()).stats();
	expect(dominant.g).toBeGreaterThan(dominant.r); // teal, not the orange one

	// or show initials, whatever Google has
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByText('Your initials')).toBeVisible();
	expect((await page.request.get('/avatar')).status()).toBe(404);
	await open(page, '/');
	await expect(account).toBeVisible();
	await expect(account.locator('img')).toHaveCount(0);
});

test('a photo can be uploaded without scripts', async ({ page, browser }, info) => {
	const email = await newKeeperWithTank(page, `photo-plain-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/settings');
	await plain.locator('#photo-file').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: await photo('#c9763a') });
	await plain.getByRole('button', { name: 'Save photo' }).click();
	await expect(plain.getByText('Your own photo')).toBeVisible();
	await plain.goto('/');
	await expect(plain.getByRole('button', { name: `Account: ${email.split('@')[0]}` }).locator('img')).toBeVisible();
	await ctx.close();
});
