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
	await expect(page.getByRole('heading', { name: 'Keep every tank on track.' })).toBeVisible();
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
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();

	// Log a water test with inline status
	await page.getByRole('link', { name: 'Log first water test' }).click();
	await expect(page.getByRole('heading', { name: 'Water test' })).toBeVisible();
	// the basics first; what a beginner's kit doesn't cover waits folded (#65)
	await expect(page.getByLabel('Phosphate', { exact: true })).toBeHidden();
	await page.getByText('1 more parameter', { exact: true }).click();
	await expect(page.getByLabel('Phosphate', { exact: true })).toBeVisible();
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await expect(page.getByText('✕ Above target 5–20 ppm')).toBeVisible();
	await page.getByLabel('KH', { exact: true }).fill('2');
	await expect(page.getByText('▲ Near limit · 2–5 dKH')).toBeVisible();
	await page.getByRole('button', { name: 'Save 3 readings' }).click();

	// Dashboard shows statuses
	await expect(page.getByRole('status')).toContainText('✓ Saved 3 readings · 1 out of range');
	// needs attention: out of range, then near a limit; then what's fine, and what's untested
	const attention = page.getByRole('region', { name: 'Needs attention' }).locator('.item');
	await expect(attention).toHaveCount(2);
	await expect(attention.nth(0)).toContainText('Nitrate ✕ High');
	await expect(attention.nth(0)).toContainText('40');
	// and what to do about it (#62)
	await expect(attention.nth(0)).toContainText('A bigger water change brings it down');
	await expect(attention.nth(1)).toContainText('KH ▲ Near low');
	// Tank parameters lists all three, the ones needing attention too, with their status (#75)
	const inRange = page.getByRole('region', { name: 'Tank parameters' });
	await expect(inRange).toContainText('✓ 1 of 3 in range');
	await expect(inRange.getByRole('link', { name: /pH\s*6\.8/ })).toHaveAttribute('href', /\/charts\?p=/);
	await expect(inRange.getByRole('link', { name: /Nitrate\s*✕ High\s*40/ })).toBeVisible();
	await expect(inRange.getByRole('link', { name: /KH\s*▲ Near low\s*2/ })).toBeVisible();
	// a not-sure planted tank (#81): the basics and phosphate, not CO₂
	await expect(inRange.getByText(/^Not tested: .*Ammonia.*Phosphate/)).toBeVisible();
	await expect(inRange.getByText(/^Not tested: .*CO₂/)).toHaveCount(0);

	// Complete a task: the water change reminder opens its log form. It isn't due
	// for a week, so it says how soon, and its button is a quiet "Done early"
	const due = page.getByRole('region', { name: 'Due' });
	await expect(due.getByText(/^In 7 days · every 7 days$/i)).toBeVisible();
	// the setup review says what it's for (#69)
	await expect(due).toContainText('Check the tank’s details, equipment, targets and livestock are still right.');
	await expect(due.getByRole('button', { name: 'Mark done', exact: true })).toHaveCount(0);
	await due.getByRole('button', { name: 'Mark Water change 25% done early' }).click();
	await expect(page).toHaveURL(/\/entries\/event\/new\?.*category=water_change/);
	await expect(page.getByLabel(/Also mark the reminder “Water change 25%” done/)).toBeChecked();
	await page.locator('label', { hasText: 'RODI' }).click();
	await page.getByRole('button', { name: 'Save water change' }).click();

	await expect(page.getByRole('status')).toContainText('✓ Water change logged · next due');
	await expect(page.getByText('Water change · 25% · RODI')).toBeVisible();
	await expect(page.getByRole('link', { name: /Water test · 3 readings/ })).toBeVisible();
});
