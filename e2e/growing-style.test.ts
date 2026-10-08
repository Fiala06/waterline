import { expect, test } from '@playwright/test';
import { open } from './helpers';

// Planted tank profiles (#81): how a planted tank is grown decides which
// parameters it starts with; the rest wait in Parameters & targets.

test('a low-tech planted tank starts with the basics, and CO₂ can be turned on', async ({ page }, info) => {
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(`lowtech-${info.project.name}-${Date.now()}@example.com`);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Java fern');

	// the planted questions only show for a planted tank
	const grown = page.getByRole('group', { name: 'How is it grown?' });
	await expect(grown).toBeHidden();
	await page.locator('label', { hasText: 'Planted' }).click();
	await expect(grown).toBeVisible();
	await expect(grown.getByRole('radio', { name: /Not sure/ })).toBeChecked();
	await grown.locator('label', { hasText: 'Low-tech' }).click();
	await page.getByRole('group', { name: 'Water' }).locator('label', { hasText: 'Tap' }).click();
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();

	// the basics are tracked; CO₂ and the advanced nutrients wait, untracked
	await open(page, '/tanks/current/targets');
	await expect(page.getByLabel('Track Nitrate')).toBeChecked();
	await expect(page.getByLabel('Track Phosphate')).toBeChecked();
	for (const name of ['CO₂', 'Potassium', 'Iron', 'TDS', 'Conductivity']) await expect(page.getByLabel(`Track ${name}`)).not.toBeChecked();

	// so the water test doesn't ask for CO₂
	await open(page, '/entries/test/new');
	await expect(page.getByLabel('Nitrate', { exact: true })).toBeVisible();
	await expect(page.getByLabel('CO₂', { exact: true })).toHaveCount(0);

	// the style and water are kept, and Tank setup can change the style without touching the parameters
	await open(page, '/tanks/current/settings');
	await expect(page.getByLabel("How it's grown")).toHaveValue('low_tech');
	await expect(page.getByLabel('Water source')).toHaveValue('tap');
	await page.getByLabel("How it's grown").selectOption('co2');
	await page.getByRole('button', { name: /^Save/ }).first().click();
	await expect(page.getByRole('status')).toContainText('✓');
	await open(page, '/tanks/current/settings');
	await expect(page.getByLabel("How it's grown")).toHaveValue('co2');
	await open(page, '/tanks/current/targets');
	await expect(page.getByLabel('Track CO₂')).not.toBeChecked();

	// turned on by hand, CO₂ is a test like any other
	await page.getByLabel('Track CO₂').check({ force: true });
	await page.getByRole('button', { name: 'Save targets' }).click();
	await expect(page.getByRole('status')).toContainText('✓');
	await open(page, '/entries/test/new');
	await expect(page.getByLabel('CO₂', { exact: true })).toBeVisible();
});

test('a CO₂-injected planted tank tracks CO₂ and the nutrients from the start', async ({ page }, info) => {
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(`co2-${info.project.name}-${Date.now()}@example.com`);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Dutch 90');
	await page.locator('label', { hasText: 'Planted' }).click();
	await page.getByRole('group', { name: 'How is it grown?' }).locator('label', { hasText: 'CO₂ injected' }).click();
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();

	await open(page, '/tanks/current/targets');
	for (const name of ['CO₂', 'Potassium', 'Iron', 'Nitrate']) await expect(page.getByLabel(`Track ${name}`)).toBeChecked();
	// and CO₂ is in view on the water test, not folded away
	await open(page, '/entries/test/new');
	await expect(page.getByLabel('CO₂', { exact: true })).toBeVisible();
});
