import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { jpeg, newKeeperWithTank, open } from './helpers';

// Scan a barcode to add equipment (#147): the number typed, or a photo read on
// the server; the lookups from a stand-in (src/routes/dev/upc).

test('a scanned barcode adds the equipment it names, and finds it again', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `barcode-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const scan = `/tanks/${tankId}/equipment/scan`;

	// from the Equipment tab
	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('link', { name: 'Scan barcode' }).click();
	await expect(page).toHaveURL(scan);

	// a typo: the check digit says so
	const typed = page.getByLabel('Or type the number under the barcode');
	await typed.fill('015561104471');
	await page.getByRole('button', { name: 'Look it up' }).click();
	await expect(page.getByText("✕ That doesn't look like a product barcode: check the digits.")).toBeVisible();

	// a product UPCitemdb knows, typed as the 12-digit UPC-A on the box: brand, model and type from its listing
	await typed.fill('015561104470');
	await page.getByRole('button', { name: 'Look it up' }).click();
	await expect(page).toHaveURL(`${scan}?code=0015561104470`);
	await expect(page.getByText('✓ Found')).toBeVisible();
	await expect(page.getByText('Fluval 407 Performance Canister Filter', { exact: true })).toBeVisible();
	await expect(page.getByText('Filter · from UPCitemdb')).toBeVisible();
	await page.getByRole('link', { name: 'Add to tank' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/equipment/new?barcode=0015561104470`);
	await expect(page.getByLabel('Brand')).toHaveValue('Fluval');
	await expect(page.getByLabel('Model')).toHaveValue('407 Performance Canister Filter');
	await expect(page.locator('input[name=type][value=filter]')).toBeChecked();
	await expect(page.getByText(/^Scanned 0015561104470: Fluval 407 Performance Canister Filter/)).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Fluval 407 Performance Canister Filter added');
	await expect(page.locator('a.name', { hasText: 'Fluval 407 Performance Canister Filter' })).toBeVisible();

	// scanned again: it's already here, with the barcode on its page
	await open(page, `${scan}?code=0015561104470`);
	await expect(page.getByText('✓ Already in this tank')).toBeVisible();
	await page.getByRole('link', { name: /^Open Fluval 407/ }).click();
	await expect(page.getByLabel('Model')).toHaveValue('407 Performance Canister Filter');
	await expect(page.getByText('Barcode 0015561104470')).toBeVisible();

	// one in neither database (an EAN-13): added by hand, with the barcode kept
	await open(page, `${scan}?code=4006381333931`);
	await expect(page.getByText('– Nothing found')).toBeVisible();
	await page.getByRole('link', { name: 'Add by hand' }).click();
	await expect(page.getByText(/^Scanned 4006381333931: nothing found for it/)).toBeVisible();
	await expect(page.getByLabel('Brand')).toHaveValue('');
	await page.locator('label', { hasText: /^Heater$/ }).click();
	await page.getByLabel('Brand').fill('Tidewell');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Tidewell added');
	await open(page, `${scan}?code=4006381333931`);
	await expect(page.getByText('✓ Already in this tank')).toBeVisible();

	// the day's lookups used up: said so, with the way around it
	await open(page, `${scan}?code=012345678905`);
	await expect(page.getByText("✕ Couldn't look it up")).toBeVisible();
	await expect(page.getByText(/used up for today/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Add by hand' })).toBeVisible();

	// without scripts: a photo of the barcode is read on the server
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const p = await ctx.newPage();
	await p.goto(scan);
	await p.locator('input[type=file][name=photo]').setInputFiles(resolve('e2e/files/barcode-ean13.png'));
	await p.getByRole('button', { name: 'Read the barcode' }).click();
	await expect(p).toHaveURL(`${scan}?code=0015561104470`);
	await expect(p.getByText('✓ Already in this tank')).toBeVisible();
	// a photo with no barcode in it
	await p.goto(scan);
	await p.locator('input[type=file][name=photo]').setInputFiles(await jpeg());
	await p.getByRole('button', { name: 'Read the barcode' }).click();
	await expect(p.getByText(/✕ No barcode found in that photo/)).toBeVisible();
	await ctx.close();
});
