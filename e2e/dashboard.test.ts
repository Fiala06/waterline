import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('dashboard (refresh 1c): the hero, and nothing needing attention when all is in range', async ({ page }, info) => {
	await newKeeperWithTank(page, `dash-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// the tank's name to switch tanks, and what it is
	await expect(page.getByRole('button', { name: 'Riverbed 40, switch tank' })).toBeVisible();
	await expect(page.getByRole('main').getByText('Planted · 40 gal', { exact: true })).toBeVisible();

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await expect(page.getByRole('region', { name: 'Needs attention' })).toHaveCount(0);
	const inRange = page.getByRole('region', { name: 'In range' });
	await expect(inRange).toContainText('✓ All 1 in range');
	await expect(inRange.getByRole('link', { name: /pH\s*7/ })).toBeVisible();
});

test("What's new links to each feature, and a tank's page opens for the tank you're on", async ({ page }, info) => {
	await newKeeperWithTank(page, `links-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/settings/changelog');
	// older releases are folded away: open them all
	for (const fold of await page.locator('summary').all()) await fold.click();
	const link = page.getByRole('link', { name: 'Settings › Calendar' }).first();
	await expect(link).toHaveAttribute('href', '/settings#calendar');
	// /tanks/current/… is that page of the current tank
	await page.getByRole('link', { name: 'Spending tab' }).first().click();
	await expect(page).toHaveURL(`/tanks/${tankId}/spending`);
	await expect(page.getByText('No spending logged yet')).toBeVisible();
});
