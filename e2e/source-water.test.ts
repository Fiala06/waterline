import { expect, test } from './test';
import { newKeeperWithTank, open } from './helpers';

// #315: the tap tested on its own, beside the tank, never as the tank's reading
test('test the tap water and see it beside the tank, without it becoming a tank reading', async ({ page }) => {
	await newKeeperWithTank(page, 'source-water');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/source-water`);
	await page.getByRole('button', { name: 'Add source' }).click();
	await expect(page.getByRole('alert')).toContainText('Give the source a name');
	await page.getByLabel('Name').fill('Kitchen tap');
	await page.getByRole('button', { name: 'Add source' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Kitchen tap added');

	// straight to its first test
	await expect(page).toHaveURL(new RegExp(`/tanks/${tankId}/source-water/[0-9a-f-]{36}/test$`));
	await page.getByLabel(/^Nitrate/).fill('60');
	await page.getByRole('button', { name: 'Save source test' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Kitchen tap tested · 1 reading');

	const tap = page.getByRole('region', { name: 'Kitchen tap' });
	await expect(tap).toContainText('✓ Tested');
	const row = tap.getByRole('row', { name: /Nitrate/ });
	await expect(row).toContainText('60');
	await expect(row).toContainText('▲ Outside tank target');
	await expect(row).toContainText('– No data');

	// the tank still has no readings, and History no test
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();
	await open(page, `/history?tank=${tankId}&cat=test&range=all`);
	await expect(page.locator('a.row', { hasText: 'Water test' })).toHaveCount(0);
});
