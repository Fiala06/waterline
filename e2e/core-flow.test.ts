import { expect, test } from '@playwright/test';

// Acceptance: sign in → set up → create a tank → log a test (inline status)
// → see it on the dashboard → complete a task.
test('core flow', async ({ page }, info) => {
	const email = `keeper-${info.project.name}-${Date.now()}@example.com`;

	// Sign in (mock Google)
	await page.goto('/');
	await expect(page).toHaveURL(/\/signin/);
	await page.getByPlaceholder('Email').fill(email);
	await page.getByPlaceholder('Name', { exact: true }).fill('Jordan Reyes');
	await page.getByRole('button', { name: /Sign in with Google/ }).click();

	// Setup
	await expect(page.getByRole('heading', { name: 'Set up your log' })).toBeVisible();
	await expect(page.getByLabel('Display name')).toHaveValue('Jordan Reyes');
	await page.locator('label', { hasText: 'Imperial' }).click();
	await page.locator('label', { hasText: 'dGH / dKH' }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();

	// Create a tank
	await expect(page.getByRole('heading', { name: 'Create your first tank' })).toBeVisible();
	await page.getByLabel('Tank name').fill('Riverbed 40');
	await page.locator('label', { hasText: 'Planted' }).click();
	await page.getByLabel('Volume').fill('40');
	await page.getByRole('button', { name: 'Create tank' }).click();

	await expect(page.getByRole('status')).toContainText('✓ Tank created');
	await expect(page.getByText('No readings yet')).toBeVisible();

	// Log a water test with inline status
	await page.getByRole('link', { name: 'Log first water test' }).click();
	await expect(page.getByRole('heading', { name: 'Water test' })).toBeVisible();
	await page.getByLabel(/^pH /).fill('6.8');
	await page.getByLabel(/^Nitrate /).fill('40');
	await expect(page.getByText('✕ Above target 5–20 ppm')).toBeVisible();
	await page.getByLabel(/^KH /).fill('2');
	await expect(page.getByText('▲ Near limit · 2–5 dKH')).toBeVisible();
	await page.getByRole('button', { name: 'Save 3 readings' }).click();

	// Dashboard shows statuses
	await expect(page.getByRole('status')).toContainText('✓ Saved 3 readings · 1 out of range');
	const cards = page.locator('.pcard');
	await expect(cards.filter({ hasText: 'Nitrate' })).toContainText('✕ High');
	await expect(cards.filter({ hasText: 'KH' })).toContainText('▲ Near low');
	await expect(cards.filter({ hasText: /^pH/ })).toContainText('✓ OK');
	await expect(cards.filter({ hasText: 'CO₂' })).toContainText('– No data');
	await expect(cards.filter({ hasText: 'Ammonia' })).toContainText('– No data');

	// Complete a task: the water change reminder opens its log form
	await page.getByRole('button', { name: 'Mark done' }).first().click();
	await expect(page).toHaveURL(/\/log\/event\?.*category=water_change/);
	await expect(page.getByLabel(/Also complete task “Water change 25%”/)).toBeChecked();
	await page.locator('label', { hasText: 'RODI' }).click();
	await page.getByRole('button', { name: 'Save water change' }).click();

	await expect(page.getByRole('status')).toContainText('✓ Water change logged · next due');
	await expect(page.getByText('Water change · 25% · RODI')).toBeVisible();
	await expect(page.getByRole('link', { name: /Water test · 3 readings/ })).toBeVisible();
});
