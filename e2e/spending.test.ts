import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { jpeg, newKeeperWithTank, open } from './helpers';

const pdf = { name: 'receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n') };

test('spending: add an expense, totals, a receipt, edit and delete', async ({ page }, info) => {
	await newKeeperWithTank(page, `spend-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/spending`);
	await expect(page.getByText('No spending logged yet')).toBeVisible();
	await page.getByRole('link', { name: 'Add expense' }).first().click();
	await page.getByLabel('Amount').fill('12,50');
	await page.getByLabel('What for').fill('All-in-one fertilizer');
	await page.getByRole('button', { name: 'Add expense' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Expense added');
	await expect(page).toHaveURL(`/tanks/${tankId}/spending`);
	const month = page.locator('.tile', { hasText: 'This month' });
	await expect(month).toContainText('$12.50');
	await expect(page.getByRole('link', { name: /All-in-one fertilizer .* Consumables \$12\.50/ })).toBeVisible();

	// a second one, with a PDF receipt
	await open(page, `/tanks/${tankId}/spending/new`);
	await page.getByLabel('Amount').fill('39.99');
	await page.getByLabel('What for').fill('Heater');
	await page.locator('label', { hasText: 'Equipment' }).click();
	await page.locator('input[name=receipt]').setInputFiles(pdf);
	await page.getByRole('button', { name: 'Add expense' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Expense added');
	await expect(month).toContainText('$52.49');
	await expect(page.getByText(/Equipment · PDF receipt/)).toBeVisible();

	// the receipt, for its owner
	await page.getByRole('link', { name: /Heater/ }).click();
	const view = page.getByRole('link', { name: 'View the PDF receipt' });
	const res = await page.request.get((await view.getAttribute('href'))!);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toBe('application/pdf');

	// a photo instead: kept without its metadata
	const tagged = await sharp((await jpeg()).buffer).withMetadata({ exif: { IFD0: { Artist: 'Someone' } } }).jpeg().toBuffer();
	await page.locator('input[name=receipt]').setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: tagged });
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Expense saved');
	await page.getByRole('link', { name: /Heater/ }).click();
	const photo = await page.request.get((await page.getByRole('link', { name: 'View the receipt photo' }).getAttribute('href'))!);
	expect(photo.headers()['content-type']).toBe('image/jpeg');
	expect((await sharp(await photo.body()).metadata()).exif).toBeUndefined();

	// not a photo or a PDF: the expense stays, the page says why
	await page.locator('input[name=receipt]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText("Expense saved, but not its receipt: That file isn't a photo or a PDF.");
	await expect(page.getByRole('link', { name: 'View the receipt photo' })).toBeVisible();

	// edit, then delete
	await page.getByLabel('Amount').fill('45');
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(month).toContainText('$57.50');
	await page.getByRole('link', { name: /Heater/ }).click();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	await page.getByRole('button', { name: 'Delete' }).last().click();
	await expect(page.getByRole('status')).toContainText('Expense deleted');
	await expect(month).toContainText('$12.50');

	// in the keeper's currency
	await open(page, '/settings');
	const saved = page.waitForResponse((r) => r.url().includes('?/save') && r.request().method() === 'POST');
	await page.locator('#currency').selectOption('EUR');
	await saved;
	await open(page, `/tanks/${tankId}/spending`);
	await expect(month).toContainText('€12.50');
});

test('a saved product, bought again, logged in one step', async ({ page }, info) => {
	await newKeeperWithTank(page, `spend-product-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/settings/products');
	await page.locator('#add-name').fill('Easy Green');
	await page.locator('#add-url').fill('shop.example.com/easy-green');
	await page.getByRole('button', { name: 'Add product' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Easy Green saved');
	await page.getByRole('link', { name: 'Log a purchase of Easy Green' }).click();
	await expect(page.getByLabel('What for')).toHaveValue('Easy Green');
	await expect(page.getByRole('radio', { name: 'Consumables' })).toBeChecked();
	await page.getByLabel('Amount').fill('18.50');
	await page.getByRole('button', { name: 'Add expense' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/spending`);
	await expect(page.getByRole('link', { name: /Easy Green .* Consumables \$18\.50/ })).toBeVisible();
});

test('spending works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `spend-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/spending/new`);
	await plain.getByLabel('Amount').fill('free');
	await plain.getByLabel('What for').fill('Java moss');
	await plain.locator('label', { hasText: 'Plants' }).click();
	await plain.getByRole('button', { name: 'Add expense' }).click();
	await expect(plain.getByText('✕ Enter an amount, like 12.50.')).toBeVisible();
	await plain.getByLabel('Amount').fill('8');
	await plain.getByRole('button', { name: 'Add expense' }).click();
	await expect(plain).toHaveURL(`/tanks/${tankId}/spending`);
	await expect(plain.getByText('Java moss')).toBeVisible();
	await expect(plain.locator('.tile', { hasText: 'This year' })).toContainText('$8.00');
	await ctx.close();
});
