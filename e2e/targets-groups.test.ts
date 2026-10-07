import { expect, test, type Page } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #83: Parameters & targets groups parameters by purpose, and says which are
// recommended for every tank of the kind, which optional, which advanced.
const row = (page: Page, name: string) => page.locator('.prow', { has: page.locator('.nm', { hasText: new RegExp(`^${name}$`) }) });
/** The group heading a parameter's row sits under. */
const groupOf = (page: Page, name: string) => row(page, name).locator('xpath=preceding-sibling::h2[1]');

test('parameters are grouped by purpose, with a level beside each', async ({ page }, info) => {
	await newKeeperWithTank(page, `groups-${info.project.name}`); // planted
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/targets`);
	const headings = page.locator('.rows .ghead');
	await expect(headings).toHaveText(['Core', 'Water chemistry', 'Plant nutrients', 'CO₂']);
	await expect(groupOf(page, 'Nitrate')).toHaveText('Core');
	await expect(groupOf(page, 'GH')).toHaveText('Water chemistry');
	await expect(groupOf(page, 'Iron')).toHaveText('Plant nutrients');
	await expect(row(page, 'Nitrate').getByText(/· Recommended$/)).toBeVisible();
	await expect(row(page, 'GH').getByText(/· Optional$/)).toBeVisible();
	await expect(row(page, 'Phosphate').getByText(/· Recommended$/)).toBeVisible();
	await expect(row(page, 'Potassium').getByText(/· Advanced$/)).toBeVisible();
	await expect(row(page, 'CO₂').getByText(/· Optional$/)).toBeVisible();

	// a custom parameter gets its own group, with no level
	await page.getByRole('button', { name: '+ Add custom parameter' }).click();
	const sheet = page.getByRole('dialog', { name: 'Custom parameter' });
	await sheet.getByLabel('Name').fill('Silicate');
	await sheet.getByRole('button', { name: /^Add to / }).click();
	await expect(page.getByRole('status')).toContainText('✓ Silicate added');
	await expect(headings).toHaveText(['Core', 'Water chemistry', 'Plant nutrients', 'CO₂', 'Custom']);
	await expect(groupOf(page, 'Silicate')).toHaveText('Custom');
	await expect(row(page, 'Silicate').getByText('Custom parameter')).toBeVisible();
	await expect(row(page, 'Silicate').getByText(/· (Recommended|Optional|Advanced)$/)).toHaveCount(0);
});

test('a reef is grouped by its own chemistry', async ({ page }, info) => {
	await newKeeperWithTank(page, `groups-reef-${info.project.name}`, 'Reef');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/targets`);
	await expect(page.locator('.rows .ghead')).toHaveText(['Core', 'Water chemistry']);
	// alkalinity, calcium, magnesium and phosphate sit with the basics, not under nutrients
	for (const name of ['Alkalinity', 'Calcium', 'Magnesium', 'Phosphate', 'Salinity']) await expect(groupOf(page, name)).toHaveText('Core');
	await expect(groupOf(page, 'ORP')).toHaveText('Water chemistry');
	await expect(row(page, 'ORP').getByText(/· Advanced$/)).toBeVisible();
	await expect(row(page, 'pH').getByText(/· Optional$/)).toBeVisible();
});
