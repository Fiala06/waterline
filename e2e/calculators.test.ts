import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #18: the Calculators page, filled in from the tank and the keeper's units (imperial by default).
test('calculators', async ({ page }, info) => {
	await newKeeperWithTank(page, `calc-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a nitrate reading in range, for the water change's starting point
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Nitrate', { exact: true }).fill('10');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	// A product with its strength, for Dose → ppm
	await open(page, '/settings/products');
	const add = page.locator('form#add');
	await add.locator('#add-name').fill('Nitrate booster');
	await add.locator('#add-url').fill('example.com/booster');
	await add.getByLabel('Dose in mL').fill('5');
	await add.getByLabel('Volume in gal').fill('10');
	await add.getByLabel('ppm added').fill('2');
	await add.getByLabel('What it adds').fill('nitrate');
	await add.getByRole('button', { name: 'Add product' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Nitrate booster saved');
	await expect(page.getByText('0.4 ppm of nitrate per mL in 10 gal')).toBeVisible();

	await open(page, `/calculators?tank=${tankId}`);
	// Tank volume: 36 × 18 × 18 in, 2 in of substrate, 1 in below the rim → 50.5 gal gross, 42.1 gal of water
	await page.locator('#v-l').fill('36');
	await page.locator('#v-w').fill('18');
	await page.locator('#v-h').fill('18');
	await page.locator('#v-s').fill('2');
	await page.locator('#v-gap').fill('1');
	await expect(page.locator('#volume .r-v').first()).toContainText('50.5');
	await expect(page.locator('#volume .r-v').nth(1)).toContainText('42.1');
	await page.getByRole('button', { name: "Save as the tank's water volume" }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water volume saved · 42.1 gal');
	// every measurement is still there after the save, ready for next time (#78)
	await page.locator('html[data-ready="true"]').waitFor();
	await expect(page.locator('#v-l')).toHaveValue('36');
	await expect(page.locator('#v-s')).toHaveValue('2');
	await expect(page.locator('#v-gap')).toHaveValue('1');
	// and a changed size is saved too, not only the first one
	await page.locator('#v-l').fill('48');
	await page.getByRole('button', { name: "Save as the tank's water volume" }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water volume saved · 56.1 gal');
	await page.locator('html[data-ready="true"]').waitFor();
	await expect(page.locator('#v-l')).toHaveValue('48');
	await expect(page.locator('#v-s')).toHaveValue('2');
	await page.locator('#v-l').fill('36');
	await page.getByRole('button', { name: "Save as the tank's water volume" }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water volume saved · 42.1 gal');
	await page.locator('html[data-ready="true"]').waitFor();

	// Water change starts from the reading, down to the target's bottom: never on an error (#66)
	await expect(page.locator('#wc-from')).toHaveValue('10');
	await expect(page.locator('#wc-to')).toHaveValue('5');
	await expect(page.getByText("✕ A water change can't get there")).toHaveCount(0);

	// Water change: nitrate 40 → 20 is half the water, 21 gal of 42.1
	await page.locator('#wc-from').fill('40');
	await page.locator('#wc-to').fill('20');
	await expect(page.locator('#wc-vol')).toHaveValue('42.1');
	await expect(page.locator('#water-change .r-v').first()).toContainText('50');
	await expect(page.locator('#water-change .r-v').nth(1)).toContainText('21.1');
	await page.locator('#wc-to').fill('50');
	await expect(page.getByText("✕ A water change can't get there")).toBeVisible();

	// Dose → ppm with the saved product: 5 mL in 42.1 gal
	await page.locator('#d-p').selectOption({ label: 'Nitrate booster · nitrate' });
	await page.locator('#d-amt').fill('10');
	await page.locator('#d-target').fill('5');
	await expect(page.locator('#dose .r-v').first()).toContainText('0.95');
	await expect(page.locator('#dose .r-v').nth(1)).toContainText('52.6');

	// Heater: 42.1 gal held 10 °F above the room → 142 W, buy 150 W
	await page.locator('#h-room').fill('68');
	await page.locator('#h-target').fill('78');
	await expect(page.locator('#heater .r-v').first()).toContainText('142');
	await expect(page.locator('#heater .r-v').nth(1)).toContainText('150 W');

	// CO₂: pH 6.6 at 4 dKH (71 ppm) is 30 ppm
	await page.locator('#c-ph').fill('6.6');
	await page.locator('#c-kh').fill('4');
	await expect(page.locator('#co2 .r-v').first()).toContainText('30.1');
	await expect(page.getByText('✓ In range · 15–35 ppm')).toBeVisible();

	// The volume is on the tank now, and in History
	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.locator('#actualVolume')).toHaveValue('42.1');
	await open(page, '/history');
	await expect(page.getByText('Water volume set · 42.1 gal').first()).toBeVisible();
});
