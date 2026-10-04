import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('saved product links, and reordering from a dosing entry', async ({ page }, info) => {
	await newKeeperWithTank(page, `products-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const dosing = `/entries/event/new?tank=${tankId}&category=dosing`;

	// A product dosed before is offered a reorder link
	await open(page, dosing);
	await page.getByLabel('Product', { exact: true }).fill('Easy Green');
	await expect(page.getByRole('link', { name: 'Save a reorder link' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save dosing' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved');
	await open(page, dosing);
	await page.getByLabel('Product', { exact: true }).fill('Easy Green');
	await page.getByRole('link', { name: 'Save a reorder link' }).click();
	await expect(page).toHaveURL(/\/settings\/products\?name=Easy%20Green#add$/);
	await expect(page.locator('#add-name')).toHaveValue('Easy Green');

	// Only web addresses; a bare one gets https://
	await page.locator('#add-url').fill('javascript:alert(1)');
	await page.getByRole('button', { name: 'Add product' }).click();
	await expect(page.getByText("✕ That doesn't look like a web address.")).toBeVisible();
	await page.locator('#add-url').fill('shop.example.com/easy-green');
	await page.locator('#add-note').fill('500 mL');
	await page.getByRole('button', { name: 'Add product' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Easy Green saved');
	// ready for the next one: nothing left in the form to add twice
	await expect(page.locator('#add-name')).toHaveValue('');
	await expect(page.locator('#add-url')).toHaveValue('');
	await expect(page.locator('#add-note')).toHaveValue('');
	const reorder = page.getByRole('link', { name: /Reorder Easy Green/ });
	await expect(reorder).toHaveAttribute('href', 'https://shop.example.com/easy-green');
	await expect(reorder).toHaveAttribute('target', '_blank');
	await expect(page.getByText('shop.example.com · 500 mL')).toBeVisible();
	await expect(page.getByText(/^Last dosed .+ in Riverbed 40$/)).toBeVisible();

	// Dosing it again: one tap to reorder
	await open(page, dosing);
	await page.getByLabel('Product', { exact: true }).fill('easy green');
	await expect(page.getByRole('link', { name: /Reorder Easy Green/ })).toHaveAttribute('href', 'https://shop.example.com/easy-green');

	// Edit, then delete
	await open(page, '/settings/products');
	await page.getByRole('link', { name: 'Edit Easy Green' }).click();
	await page.getByLabel('Note · optional').first().fill('1 L');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('shop.example.com · 1 L')).toBeVisible();
	await page.getByRole('link', { name: 'Edit Easy Green' }).click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('status')).toContainText('Easy Green deleted');
	await expect(page.getByText('No products yet')).toBeVisible();

	await open(page, '/settings');
	await expect(page.getByRole('link', { name: /Saved product links/ })).toHaveAttribute('href', '/settings/products');
});

test('product links work without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `products-plain-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/settings/products');
	await plain.locator('#add-name').fill('Frozen bloodworms');
	await plain.locator('#add-url').fill('https://shop.example.com/bloodworms');
	await plain.getByRole('button', { name: 'Add product' }).click();
	await expect(plain.getByRole('link', { name: /Reorder Frozen bloodworms/ })).toBeVisible();
	// Edit is a link that opens the form
	await plain.getByRole('link', { name: 'Edit Frozen bloodworms' }).click();
	await plain.getByLabel('Note · optional').first().fill('Cube pack');
	await plain.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(plain.getByText('shop.example.com · Cube pack')).toBeVisible();
	await ctx.close();
});

// #73: a product saved in Settings › Products is offered when logging a dose, before it's ever dosed
test('a saved product is offered on Log › Dose', async ({ page }, info) => {
	await newKeeperWithTank(page, `products-offer-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, '/settings/products');
	await page.locator('#add-name').fill('Thrive S');
	await page.locator('#add-url').fill('shop.example.com/thrive-s');
	await page.getByRole('button', { name: 'Add product' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Thrive S saved');

	await open(page, `/entries/event/new?tank=${tankId}&category=dosing`);
	await expect(page.getByRole('link', { name: 'Manage products ›' })).toHaveAttribute('href', '/settings/products');
	await page.getByRole('button', { name: 'Thrive S', exact: true }).click();
	await expect(page.getByLabel('Product', { exact: true })).toHaveValue('Thrive S');
	await expect(page.getByRole('link', { name: /Reorder Thrive S/ })).toHaveAttribute('href', 'https://shop.example.com/thrive-s');
});
