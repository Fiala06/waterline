import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Dashboard personalization (#94): light choices per tank, on the account, reversible.

test('a keeper picks what Trends opens on, what is listed first and what is shown, then resets', async ({ page }, info) => {
	await newKeeperWithTank(page, `customize-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	for (const n of [3, 0]) {
		// today's is logged now: 09:00 today is still to come early in the day
		await open(page, `/entries/test/new?tank=${tankId}${n ? `&date=${daysAgo(n)}&time=09:00` : ''}`);
		await page.getByLabel('pH', { exact: true }).fill('7.0');
		await page.getByLabel('KH', { exact: true }).fill('4');
		await page.getByLabel('Nitrate', { exact: true }).fill('10');
		await page.getByRole('button', { name: 'Save 3 readings' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 3 readings');
	}

	// as it comes: pH first (the tank's order), Trends on the first with readings, Recent shown
	// the parameters' own links (the heading's Charts › link comes first)
	const params = page.getByRole('region', { name: 'Tank parameters' }).locator('a[href^="/charts?p="]');
	await expect(params.first()).toContainText('pH');
	await expect(page.getByRole('region', { name: 'Trends' }).getByRole('button', { pressed: true })).toHaveText('pH');
	await expect(page.getByRole('region', { name: 'Recent' })).toBeVisible();
	const customize = page.locator('details.customize');
	await expect(customize.locator('summary')).toHaveText(/^⚙Customize this dashboard$/);

	await customize.locator('summary').click();
	await page.getByLabel('Trends opens on').selectOption({ label: 'KH' });
	await customize.getByRole('checkbox', { name: 'KH' }).check({ force: true });
	await customize.getByRole('checkbox', { name: 'Nitrate' }).check({ force: true });
	await customize.getByRole('checkbox', { name: /^Recent/ }).uncheck({ force: true });
	await customize.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dashboard saved');

	// nitrate and KH first (in the tank's own order), Trends on KH, no Recent; the choice is on the account, so a fresh load keeps it
	await open(page, `/?tank=${tankId}`);
	await expect(params.nth(0)).toContainText('Nitrate');
	await expect(params.nth(1)).toContainText('KH');
	await expect(params.nth(2)).toContainText('pH');
	await expect(page.getByRole('region', { name: 'Trends' }).getByRole('button', { pressed: true })).toHaveText('KH');
	await expect(page.getByRole('region', { name: 'Recent' })).toHaveCount(0);
	await expect(customize.locator('summary')).toContainText('Customize this dashboard · changed');

	// another tank is untouched
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Second');
	await page.getByLabel('Volume').fill('10');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();
	await expect(page.locator('details.customize summary')).toHaveText(/^⚙Customize this dashboard$/);

	// Reset brings the defaults back
	await open(page, `/?tank=${tankId}`);
	await customize.locator('summary').click();
	await customize.getByRole('button', { name: 'Reset to defaults' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dashboard back to its defaults');
	await expect(params.first()).toContainText('pH');
	await expect(page.getByRole('region', { name: 'Recent' })).toBeVisible();
});
