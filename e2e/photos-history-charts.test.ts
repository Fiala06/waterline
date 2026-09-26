import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('photos, history and charts', async ({ page }, info) => {
	await newKeeperWithTank(page, `m6-${info.project.name}`);
	const tankUrl = page.url();

	// Two tests a week apart so the chart has a line; the older one is backdated through the URL.
	const tankId = new URL(tankUrl).searchParams.get('tank')!;
	const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/log/test?tank=${tankId}&date=${lastWeek}&time=08:00`);
	await page.getByLabel(/^Nitrate /).fill('12');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	await open(page, `/log/event?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');

	await open(page, `/log/test?tank=${tankId}`);
	await page.getByLabel(/^Nitrate /).fill('35');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('1 out of range');

	// Note with only a photo
	await open(page, `/log/event?tank=${tankId}&category=note`);
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg('#c8a040', 'plants.jpg'));
	await page.getByRole('button', { name: 'Save note' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Photo added');

	// Gallery → viewer → set as cover
	await open(page, '/photos');
	const tiles = page.locator('a.tile');
	await expect(tiles).toHaveCount(2);
	await tiles.first().click();
	await expect(page.locator('.pos')).toHaveText('1 of 2');
	const img = page.locator('.stage img');
	await expect(img).toHaveJSProperty('complete', true);
	expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640);
	if (info.project.name === 'phone') await page.getByRole('link', { name: 'More', exact: true }).click();
	await page.getByRole('button', { name: 'Set as cover' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Set as tank cover');
	await page.getByRole('link', { name: 'Next photo' }).click();
	await expect(page.locator('.pos')).toHaveText('2 of 2');

	// History: filters and grouping
	await open(page, '/history');
	await expect(page.getByRole('heading', { name: /^TODAY · / })).toBeVisible();
	await expect(page.getByText('✕ Nitrate 35')).toBeVisible();
	await page.getByRole('link', { name: /Water changes/ }).first().click();
	await expect(page.locator('a.row', { hasText: 'Water change · 25% · Tap' })).toBeVisible();
	await expect(page.getByText(/Water test ·/)).toHaveCount(0);

	// Charts: nitrate line with the water change marker and stats
	await open(page, '/charts');
	await expect(page.getByRole('img', { name: /Nitrate over time/ })).toBeVisible();
	await expect(page.locator('.stat').filter({ hasText: 'Latest' })).toContainText('35');
	await expect(page.locator('.stat').filter({ hasText: 'In range' })).toContainText('50%');
	await page.getByRole('button', { name: /Water change · 25% · Tap/ }).first().click();
	await expect(page.getByText('Nitrate 12 → 35 ppm')).toBeVisible();
});
