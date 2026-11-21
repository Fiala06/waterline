import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #318: a saved product's stock: measured, doses in mL taken off, a refill, and an opt-in low alert
test('track what is left of a fertilizer, with a low-stock alert you turn on', async ({ page }, info) => {
	await newKeeperWithTank(page, `stock-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/settings/products');
	await page.getByLabel('Name').first().fill('Thrive S');
	await page.getByLabel('Link').first().fill('https://example.com/thrive');
	await page.getByRole('button', { name: /^Save/ }).first().click();
	await expect(page.getByRole('status')).toContainText('✓ Thrive S saved');

	await page.getByRole('link', { name: /Track what’s left/ }).click();
	await page.getByLabel('How much is in the bottle').fill('100');
	await page.getByRole('button', { name: 'Start tracking' }).click();
	await expect(page.locator('.left')).toHaveText('100 mL');
	await expect(page.getByText(/^Measured: 100 mL/)).toBeVisible();

	// a dose in mL is taken off
	await open(page, `/entries/event/new?tank=${tankId}&category=dosing`);
	await page.getByLabel('Product').fill('Thrive S');
	await page.getByLabel('Amount').fill('70');
	await page.getByRole('button', { name: 'Save dosing' }).click();
	await expect(page.getByRole('status')).toBeVisible();
	await open(page, '/settings/products');
	await page.getByRole('link', { name: /About 30 mL left/ }).click();
	await expect(page.getByText(/^Estimated: you measured 100 mL/)).toBeVisible();

	// low below 50 mL: only an alert once it's turned on
	await page.getByLabel('Low below · optional').fill('50');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByText('▲ Low · below 50 mL')).toBeVisible();
	await open(page, '/alerts');
	await expect(page.getByText('Thrive S is running low')).toHaveCount(0);
	await open(page, '/settings/products');
	await page.getByRole('link', { name: /▲ Low · about 30 mL left/ }).click();
	await page.getByLabel(/Tell me under Alerts/).check();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await open(page, '/alerts');
	await expect(page.getByText('Thrive S is running low')).toBeVisible();

	// a refill quiets it
	await page.getByRole('link', { name: 'Stock' }).first().click();
	await page.getByLabel(/Refilled/).fill('500');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.locator('.left')).toHaveText('530 mL');
	await open(page, '/alerts');
	await expect(page.getByText('Thrive S is running low')).toHaveCount(0);
});
