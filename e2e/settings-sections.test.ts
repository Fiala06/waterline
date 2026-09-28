import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { newKeeperWithTank, open } from './helpers';

// #28: Server settings in the order a server is set up, a link for every
// part, and signing out only from the account menu.

test('every part of Settings has its own address, and Server settings lists its parts', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `sections-${info.project.name}`);
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update users set is_admin = 1 where email = ?').run(email);
	db.close();
	const desktop = info.project.name === 'desktop';

	// in the order it's set up
	await open(page, '/settings/server');
	const order = await page.locator('main section.sec, main form.sec').evaluateAll((els) => els.map((e) => e.id));
	expect(order).toEqual(['sign-in', 'email', 'public-pages', 'features', 'about']);

	// the parts: beside the page on desktop, at its top on a phone
	const parts = desktop ? page.getByRole('navigation', { name: 'Settings sections' }) : page.getByRole('navigation', { name: 'On this page' });
	for (const name of ['Sign-in', 'Email', 'Public pages', 'Features', 'Logs & version']) await expect(parts.getByRole('link', { name, exact: true })).toBeVisible();
	await parts.getByRole('link', { name: 'Features', exact: true }).click();
	await expect(page).toHaveURL('/settings/server#features');
	await expect(page.getByRole('heading', { name: /^Features/ })).toBeInViewport();

	// a shared address opens right at its part, deeper ones too
	await open(page, '/settings/server#species-photos');
	await expect(page.getByLabel('Species photos')).toBeInViewport();
	await open(page, '/settings/server#who-can-sign-in');
	await expect(page.getByLabel("Admin's Google account")).toBeInViewport();

	// each heading's own link, which also copies it
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
	await page.locator('#email h2').hover().catch(() => {});
	await page.locator('#email').getByRole('link', { name: 'Link to this section' }).first().click();
	await expect(page).toHaveURL('/settings/server#email');
	await expect(page.getByRole('status')).toContainText('✓ Link copied');
	await open(page, '/settings');
	await expect(page.locator('#calendar').getByRole('link', { name: 'Link to this section' })).toHaveAttribute('href', '#calendar');

	// signing out: not in Settings' menu, but in the account menu
	if (desktop) await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});
