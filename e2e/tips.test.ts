import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('tips explain parameters and less obvious fields', async ({ page }, info) => {
	await newKeeperWithTank(page, `tips-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// Water test: an ⓘ beside the name; the field is still named by it
	await open(page, `/entries/test/new?tank=${tankId}`);
	const kh = page.getByRole('button', { name: 'About KH' });
	const khText = page.getByText(/^Carbonate hardness, the water’s buffer/);
	await expect(kh).toHaveAccessibleDescription(/Carbonate hardness/); // heard without opening it
	await kh.click();
	await expect(khText).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(khText).toBeHidden();
	await page.getByLabel('KH', { exact: true }).fill('4');
	await expect(page.getByLabel('KH', { exact: true })).toHaveAccessibleDescription(/Target 2–5 dKH/);

	// Parameters & targets
	await open(page, `/tanks/${tankId}/targets`);
	await page.getByRole('button', { name: 'About Nitrite' }).click();
	await expect(page.getByText(/stops their blood carrying oxygen/)).toBeVisible();

	// Tank settings: the two volumes
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByRole('button', { name: 'About actual volume' }).click();
	await expect(page.getByText(/often 10–20% less/)).toBeVisible();

	// Water change: source water
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: 'About source water' }).click();
	await expect(page.getByText(/reverse osmosis and deionization/)).toBeVisible();
});

test('tips open without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `tips-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/targets`);
	await plain.getByRole('button', { name: 'About pH', exact: true }).click();
	await expect(plain.getByText(/How acidic or alkaline the water is/)).toBeVisible();
	await ctx.close();
});
