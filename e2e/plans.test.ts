import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #177: a treatment plan from a starter, edited before it starts, shown on Tasks, and ended early
test('start a blackout plan, see it run, end it early', async ({ page }, info) => {
	await newKeeperWithTank(page, `plans-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// a dosing routine to hold back
	await open(page, `/tasks/new?tank=${tankId}&type=dosing`);
	await page.getByLabel('Product').fill('Thrive');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive added');

	await open(page, '/tasks');
	await page.getByRole('link', { name: 'Start a treatment plan ›' }).click();
	await page.getByRole('link', { name: /^Blackout/ }).click();
	await expect(page.getByRole('heading', { name: /Steps · from today, 19 days/ })).toBeVisible();
	// the ferts are ticked to hold back; leave out the last step
	await expect(page.getByRole('checkbox', { name: 'Dose Thrive' })).toBeChecked();
	await page.getByRole('checkbox', { name: 'Keep Back to the usual photoperiod' }).uncheck();
	await expect(page.getByRole('heading', { name: /Steps · from today, 5 days/ })).toBeVisible();
	await page.getByRole('button', { name: 'Start blackout' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Blackout started');
	await expect(page.getByText('Day 1 of 5')).toBeVisible();
	await expect(page.getByRole('link', { name: /Blackout: keep the tank covered/ })).toBeVisible();

	// on Tasks: the plan, its first step due, the ferts paused
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: 'Plans · 1' })).toBeVisible();
	await expect(page.locator('.row', { hasText: 'Blackout: keep the tank covered' })).toContainText('Due today');
	await expect(page.locator('.row.paused', { hasText: 'Dose Thrive' })).toBeVisible();

	// End early: steps close, the ferts are back
	await page.getByRole('link', { name: /^Blackout\s/ }).click();
	await page.getByRole('button', { name: 'End early' }).click();
	await expect(page.getByRole('status')).toContainText('Blackout ended early');
	await expect(page.getByText(/^Ended early/)).toBeVisible();
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: /^Plans/ })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: /^Paused/ })).toHaveCount(0);
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Started plan: Blackout/ })).toHaveCount(1);
	await expect(page.getByRole('link', { name: /^Ended plan early: Blackout/ })).toHaveCount(1);
});
