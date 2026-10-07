import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, openQuickAdd } from './helpers';

// Quick log favorites (#93): pinned entries on Quick add, each opening its
// log form filled in; nothing is saved until the keeper saves.

test('favorites open a form filled in from Quick add, and are managed in Settings', async ({ page }, info) => {
	await newKeeperWithTank(page, `favorites-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// nothing pinned yet: Quick add points to the settings page
	await openQuickAdd(page);
	await expect(page.getByRole('link', { name: 'Pin what you log most as favorites ›' })).toBeVisible();
	await page.getByRole('link', { name: 'Pin what you log most as favorites ›' }).click();
	await expect(page.getByRole('heading', { name: 'Quick log favorites' })).toBeVisible();
	await expect(page.getByText('No favorites yet')).toBeVisible();

	// a 40% tap water change for every tank; the name comes from the fields
	const add = page.locator('form#add');
	await add.getByRole('radio', { name: 'Water change' }).check({ force: true });
	await add.locator('.for-water_change').getByLabel('Amount', { exact: true }).fill('40');
	await add.getByRole('radio', { name: 'Tap' }).check({ force: true });
	await add.getByRole('button', { name: 'Add favorite' }).click();
	await expect(page.getByRole('status')).toContainText('✓ 40% water change pinned');
	const list = page.getByRole('list', { name: 'Favorites' });
	await expect(list.locator('.name', { hasText: '40% water change' })).toBeVisible();
	await expect(list.getByText('Water change · 40% · Tap · Every tank')).toBeVisible();

	// a dose for this tank, with its own name; a dose needs its product
	await add.getByRole('radio', { name: 'Dose' }).check({ force: true });
	await add.getByRole('button', { name: 'Add favorite' }).click();
	await expect(page.getByText('✕ Enter the product it doses.')).toBeVisible();
	await add.getByLabel('Product').fill('Thrive');
	await add.locator('.for-dosing').getByLabel('Amount', { exact: true }).fill('5');
	await add.getByLabel('Name · optional').fill('Daily ferts');
	await add.getByLabel('Tank', { exact: true }).selectOption(tankId);
	await add.getByRole('button', { name: 'Add favorite' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Daily ferts pinned');
	await expect(list.getByText('Dose · Thrive · 5 mL · Riverbed 40')).toBeVisible();

	// the order is the keeper's
	await page.getByRole('button', { name: 'Move Daily ferts up' }).click();
	await expect(list.getByRole('listitem').first()).toContainText('Daily ferts');

	// Quick add lists them first; the dose opens its form filled in, and nothing is saved
	await open(page, `/?tank=${tankId}`);
	await openQuickAdd(page);
	const dialog = page.getByRole('dialog', { name: 'Quick add' });
	const favs = dialog.getByRole('region', { name: 'Favorites' });
	await expect(favs.getByRole('link', { name: /Daily ferts/ })).toBeVisible();
	await expect(favs.getByRole('link', { name: /40% water change/ })).toBeVisible();
	await favs.getByRole('link', { name: /Daily ferts/ }).click();
	await expect(page).toHaveURL(/\/entries\/event\/new\?.*category=dosing.*product=Thrive/);
	await expect(page.getByLabel('Product', { exact: true })).toHaveValue('Thrive');
	await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('5');
	await expect(page.getByRole('button', { name: 'Save dosing' })).toBeVisible();
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Thrive')).toHaveCount(0);

	// the water change favorite: 40%, tap
	await openQuickAdd(page);
	await dialog.getByRole('region', { name: 'Favorites' }).getByRole('link', { name: /40% water change/ }).click();
	await expect(page).toHaveURL(/category=water_change.*amount=40/);
	await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('40');
	await expect(page.getByRole('radio', { name: '%' })).toBeChecked();

	// the settings page counts them; remove one
	await open(page, '/settings');
	await expect(page.getByRole('link', { name: /Quick log favorites/ })).toContainText('2');
	await page.getByRole('link', { name: /Quick log favorites/ }).click();
	await page.getByRole('link', { name: 'Edit Daily ferts' }).click();
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('status')).toContainText('Daily ferts removed');
	await expect(list.getByText('Daily ferts')).toHaveCount(0);
});

test('a dosing routine can be pinned in one tap', async ({ page }, info) => {
	await newKeeperWithTank(page, `favorites-routine-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tasks/new?tank=${tankId}&type=dosing`);
	await page.getByLabel('Product').fill('Easy Green');
	await page.getByLabel('Amount').fill('2');
	await page.getByLabel('Unit').selectOption('pumps');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓');

	await open(page, '/settings/favorites');
	const suggest = page.getByRole('region', { name: 'From your routines' });
	await expect(suggest.getByText('Dose Easy Green 2 pumps', { exact: true })).toBeVisible();
	await suggest.getByRole('button', { name: /Pin Dose Easy Green 2 pumps/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Easy Green 2 pumps pinned');
	await expect(page.getByRole('list', { name: 'Favorites' }).getByText('Dose · Easy Green · 2 pumps · Riverbed 40')).toBeVisible();
	// pinned: no longer suggested
	await expect(page.getByRole('region', { name: 'From your routines' })).toHaveCount(0);
});
