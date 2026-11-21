import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #316: a top-off is logged on its own, in the keeper's units, and never counts as a water change
test('log a top-off beside a water change, and a top-off reminder', async ({ page }, info) => {
	await newKeeperWithTank(page, `top-off-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a water change and a top-off the same day
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('logged');
	await open(page, `/entries/event/new?tank=${tankId}&category=top_off`);
	await expect(page.getByText("It isn't counted as a water change.")).toBeVisible();
	await page.getByLabel(/Amount/).fill('1.5');
	await page.locator('label.option', { hasText: 'Tap' }).click();
	await page.getByRole('button', { name: 'Save top-off' }).click();
	await expect(page.getByRole('status')).toContainText('logged');

	await open(page, `/history?tank=${tankId}`);
	await expect(page.locator('a.row', { hasText: 'Top off · 1.5 gal · Tap' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: 'Water change · ' })).toHaveCount(1);
	await open(page, `/history?tank=${tankId}&cat=top_off`);
	await expect(page.locator('a.row', { hasText: 'Top off' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: 'Water change' })).toHaveCount(0);

	// a top-off reminder, by its name: logging a top-off offers it, never the water change's
	await open(page, `/tasks/new?tank=${tankId}`);
	await page.getByRole('textbox', { name: 'Task' }).fill('Top off the tank');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('Top off the tank added');
	await open(page, `/entries/event/new?tank=${tankId}&category=top_off`);
	await expect(page.getByText(/Top off the tank/)).toBeVisible();
	await expect(page.getByText(/Water change 25%/)).toHaveCount(0);
});

test.describe('offline', () => {
	test.use({ serviceWorkers: 'allow' });
	test('a top-off logged offline syncs once, as a top-off', async ({ page, context }, info) => {
		await newKeeperWithTank(page, `top-off-offline-${info.project.name}`);
		const tankId = new URL(page.url()).searchParams.get('tank')!;
		await page.evaluate(() => navigator.serviceWorker.ready);
		await open(page, `/?tank=${tankId}`);
		await open(page, `/entries/event/new?tank=${tankId}&category=top_off`);
		await context.setOffline(true);
		await page.getByLabel(/Amount/).fill('2');
		await page.getByRole('button', { name: 'Save top-off' }).click();
		await expect(page.getByText("You're offline. Saved, and it'll sync when you're back on dry land.")).toBeVisible();
		await context.setOffline(false);
		await expect(page.getByText('✓ Synced 1 entry')).toBeVisible({ timeout: 10_000 });
		await open(page, `/history?tank=${tankId}`);
		await expect(page.locator('a.row', { hasText: 'Top off · 2 gal · RODI' })).toHaveCount(1);
		await expect(page.locator('a.row', { hasText: 'Water change · ' })).toHaveCount(0);
	});
});
