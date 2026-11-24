import { expect, test } from './test';
import { newKeeperWithTank, open } from './helpers';

// #84: a known plant's sheet shows its care profile beside the tank's own temperature; an unknown one has none
test("a plant's care profile, in the tank's context, and none for a plant Waterline doesn't know", async ({ page }, info) => {
	await newKeeperWithTank(page, `plant-care-${info.project.name}`, 'Planted', 'Low-tech');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// a temperature reading for the tank: 77 °F
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Temperature', { exact: true }).fill('77');
	await page.getByRole('button', { name: /Save 1 reading/ }).click();
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');

	await open(page, `/tanks/${tankId}/plants`);
	await page.getByRole('button', { name: 'Add plant' }).first().click();
	await page.locator('#plant-name').fill('Hemianthus callitrichoides');
	await page.getByRole('option', { name: /Hemianthus callitrichoides/ }).first().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Add plant' }).click();
	await expect(page.getByRole('status')).toContainText('added');
	await page.getByRole('button', { name: /Hemianthus callitrichoides/ }).first().click();
	const care = page.getByRole('dialog').getByRole('region', { name: 'Care' });
	await expect(care).toContainText('Strong light');
	await expect(care).toContainText('✓ Your tank: 77 °F');
	await expect(care).toContainText('Your tank has no injected CO₂');
	await expect(care).toContainText('a starting point rather than a rule');
	await page.keyboard.press('Escape');

	// one it doesn't know: no profile, and everything else as before
	await page.getByRole('button', { name: 'Add plant' }).first().click();
	await page.locator('#plant-name').fill('My mystery stem');
	await page.getByRole('dialog').getByRole('button', { name: 'Add plant' }).click();
	await expect(page.getByRole('status')).toContainText('My mystery stem added');
	await page.getByRole('button', { name: /^My mystery stem/ }).click();
	await expect(page.getByRole('dialog').getByRole('region', { name: 'Care' })).toHaveCount(0);
	await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('My mystery stem');
});
