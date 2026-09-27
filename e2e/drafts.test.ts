import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Readings typed into a log form survive leaving it before saving.

test('a water test left before saving comes back, and saving forgets it', async ({ page }, info) => {
	await newKeeperWithTank(page, `draft-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByRole('link', { name: 'Close' }).click();
	await expect(page).not.toHaveURL(/\/entries\/test\/new/);

	// back again: both readings are there, with a way to drop them
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect(page.getByText('Restored 2 unsaved readings')).toBeVisible();
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('6.8');
	await expect(page.getByLabel('Nitrate', { exact: true })).toHaveValue('40');
	await page.getByRole('button', { name: 'Discard' }).click();
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('');
	await expect(page.getByText('Restored 2 unsaved readings')).toHaveCount(0);

	// after Discard, and after a save, the form starts empty
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('');
	await page.getByLabel('pH', { exact: true }).fill('7.1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('');
	await expect(page.getByText(/^▲ Restored/)).toHaveCount(0);
});

test('adding a parameter from a water test keeps the readings on screen', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', '"+ Add parameter" is in the desktop layout (08)');
	await newKeeperWithTank(page, `addparam-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByRole('link', { name: '+ Add parameter' }).click();
	const sheet = page.getByRole('dialog', { name: 'Custom parameter' });
	await expect(sheet).toBeVisible();
	await sheet.getByLabel('Name').fill('Silicate');
	await sheet.getByRole('button', { name: /^Add to / }).click();

	await expect(page.getByRole('status')).toContainText('✓ Silicate added');
	await expect(page).toHaveURL(/\/entries\/test\/new/);
	await expect(page.getByLabel('Silicate', { exact: true })).toBeVisible();
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('6.8');
});

test('switching category keeps what was typed for each one', async ({ page }, info) => {
	await newKeeperWithTank(page, `draftcat-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByLabel('Note').fill('topped off with prime');
	await page.getByRole('link', { name: 'Dosing', exact: true }).click();
	await expect(page).toHaveURL(/category=dosing/);
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByRole('link', { name: 'Water change', exact: true }).click();
	await expect(page).toHaveURL(/category=water_change/);
	await expect(page.getByText("Restored what you hadn't saved")).toBeVisible();
	await expect(page.getByLabel('Note')).toHaveValue('topped off with prime');
});
