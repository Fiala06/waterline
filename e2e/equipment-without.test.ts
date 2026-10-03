import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// A tank can go without a heater or filter on purpose: marked, it reads as a choice, not a gap.

test('Goes without: No heater on the tank, until one is added', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `without-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('button', { name: 'No heater' }).click();
	await expect(page.getByRole('status')).toContainText('✓ No heater in this tank');
	await expect(page.getByRole('button', { name: '✓ No heater' })).toHaveAttribute('aria-pressed', 'true');

	// the tank's page lists it with the equipment, and History has it
	await open(page, `/tanks/${tankId}`);
	await expect(page.locator('a.eq', { hasText: 'Heater' })).toContainText('None');
	await open(page, '/history?range=all');
	await expect(page.getByText('No heater in this tank').first()).toBeVisible();

	// without scripts too
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const p = await ctx.newPage();
	await p.goto(`/tanks/${tankId}/equipment`);
	await p.getByRole('button', { name: 'No filter' }).click();
	await expect(p.getByRole('button', { name: '✓ No filter' })).toBeVisible();
	await p.getByRole('button', { name: '✓ No filter' }).click();
	await expect(p.getByRole('button', { name: 'No filter', exact: true })).toBeVisible();
	await ctx.close();

	// a heater added: it has one now, so "No heater" goes
	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Heater$/ }).click();
	await page.getByLabel('Brand').fill('Tidewell');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toBeVisible();
	await open(page, `/tanks/${tankId}/equipment`);
	await expect(page.getByRole('button', { name: /No heater/ })).toHaveCount(0);
	await open(page, `/tanks/${tankId}`);
	await expect(page.locator('a.eq', { hasText: 'None' })).toHaveCount(0);
});
