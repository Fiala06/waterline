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
