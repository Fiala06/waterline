import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #319: a shrimp tank tracks and shows its readings, with no one-size targets; it can be turned on later
test('a shrimp tank keeps TDS in view from the start', async ({ page }, info) => {
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(`shrimp-${info.project.name}-${Date.now()}@example.com`);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Shrimp cube');
	await page.locator('label', { hasText: 'Planted' }).click();
	await page.getByRole('group', { name: 'How is it grown?' }).locator('label', { hasText: 'Low-tech' }).click();
	// only for freshwater and planted tanks
	const shrimp = page.getByRole('checkbox', { name: /Shrimp tank/ });
	await page.locator('label', { hasText: 'Reef' }).click();
	await expect(shrimp).toBeHidden();
	await page.locator('label', { hasText: 'Planted' }).click();
	await shrimp.check();
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();

	// TDS tracked (low-tech would leave it off) and in view on the first test, without a target
	await open(page, '/tanks/current/targets');
	await expect(page.getByLabel('Track TDS')).toBeChecked();
	await expect(page.getByText('✓ On: temperature, pH, GH, KH and TDS')).toBeVisible();
	await open(page, '/entries/test/new');
	await expect(page.getByLabel('TDS', { exact: true })).toBeVisible();
});

test('the shrimp profile turned on and off for an existing tank keeps its parameters', async ({ page }, info) => {
	await newKeeperWithTank(page, `shrimp-later-${info.project.name}`, 'Planted', 'Low-tech');
	await open(page, '/tanks/current/targets');
	await expect(page.getByLabel('Track TDS')).not.toBeChecked();
	await page.getByRole('button', { name: 'Turn on shrimp readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Shrimp readings on');
	await expect(page.getByLabel('Track TDS')).toBeChecked();
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByRole('status')).toContainText('Shrimp readings off');
	await expect(page.getByLabel('Track TDS')).toBeChecked();
});
