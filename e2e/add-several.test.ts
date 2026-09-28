import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Add several livestock or plants at once, from the species list.

test('add several livestock: tick species, set counts, add them all, and Undo', async ({ page }, info) => {
	await newKeeperWithTank(page, `several-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/livestock`);
	await page.getByRole('link', { name: 'Add several at once' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/livestock/several`);
	await expect(page.getByText('Nothing picked yet')).toBeVisible();

	const search = page.getByLabel('Search species');
	await search.fill('neon tetra');
	await page.getByRole('button', { name: /^Neon tetra/ }).click();
	await search.fill('amano');
	await page.getByRole('button', { name: /^Amano shrimp/ }).click();
	await search.fill('Bob the snail');
	await page.getByRole('button', { name: /Add “Bob the snail”/ }).click();
	await expect(page.getByText('Adding · 3')).toBeVisible();

	await page.getByLabel('How many Neon tetra').fill('8');
	await page.getByRole('button', { name: 'More Amano shrimp' }).click();
	await page.getByRole('button', { name: 'More Amano shrimp' }).click();
	await page.getByLabel('Bob the snail: fish, invert or coral').selectOption('invert');
	await page.getByRole('button', { name: 'Take Bob the snail off the list' }).click();
	await expect(page.getByText('Adding · 2')).toBeVisible();

	await page.getByRole('button', { name: 'Add 11 animals · 2 species' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/livestock`);
	await expect(page.getByRole('status')).toContainText('✓ Added 11 animals · 2 species');
	await expect(page.getByText('11 animals · 2 species', { exact: true })).toBeVisible();

	// Undo takes them all back
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('No livestock yet')).toBeVisible();
});

test('add several plants, each with its place', async ({ page }, info) => {
	await newKeeperWithTank(page, `several-plants-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/plants/several`);
	const search = page.getByLabel('Search plants');
	await search.fill('java fern');
	await page.getByRole('button', { name: /^Java fern/ }).click();
	await search.fill('monte carlo');
	await page.getByRole('button', { name: /^Monte Carlo/ }).first().click();
	await page.getByLabel('Where Java fern goes').selectOption('epiphyte');
	await page.getByLabel(/^Where Monte Carlo/).selectOption('foreground');
	await page.getByRole('button', { name: 'Add 2 plants' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Added 2 plants');
	await expect(page.getByRole('heading', { name: 'Epiphyte', exact: false }).first()).toBeVisible();
	await expect(page.getByText('Java fern').first()).toBeVisible();
});

test('add several works without scripts: one per line', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `several-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/livestock/several`);
	await plain.getByLabel('Species, one per line, with how many').fill('6 Neon tetra\n3 Amano shrimp');
	await plain.getByRole('button', { name: 'Add them' }).click();
	await expect(plain).toHaveURL(`/tanks/${tankId}/livestock`);
	await expect(plain.getByText('9 animals · 2 species', { exact: true })).toBeVisible();
	await ctx.close();
});
