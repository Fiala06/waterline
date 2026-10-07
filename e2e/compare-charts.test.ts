import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Comparing parameters (#87): up to two more on the same chart, each on its
// own scale, named in the address.

test('two parameters on one chart, each on its own scale, kept in the address', async ({ page }, info) => {
	await newKeeperWithTank(page, `compare-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'tests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`Date,Time,Nitrate,Phosphate,pH\n${day(14)},09:00,10,0.5,6.8\n${day(7)},09:00,18,1.2,6.6\n${day(1)},09:00,12,0.8,6.9\n`)
	});
	await page.getByRole('button', { name: 'Add 3 water tests' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 3 water tests');

	await open(page, `/charts?tank=${tankId}`);
	await page.getByRole('link', { name: /^Nitrate/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Nitrate' })).toBeVisible();
	const chart = page.locator('.chart').first();
	await expect(chart.locator('polyline.compare')).toHaveCount(0);

	// Compare… with phosphate: a dashed line on its own axis, named in the legend and the address
	await page.getByText('Compare…').click();
	await page.locator('.compare-menu label', { hasText: 'Phosphate' }).click();
	await expect(page).toHaveURL(/[?&]c=[^&]+/);
	await expect(chart.locator('polyline.compare.c1')).toHaveCount(1);
	await expect(chart.locator('text.axis-title.axis2')).toHaveText('Phosphate (ppm)');
	await expect(page.locator('.legend')).toContainText('Phosphate (ppm) · own scale, right');
	await expect(page.getByRole('link', { name: 'Stop comparing with Phosphate' })).toBeVisible();
	// the main parameter's target band is still there, its zone labels make way for the axis
	await expect(chart.locator('rect[fill="var(--band)"]')).toHaveCount(1);
	await expect(chart.locator('text.zone')).toHaveCount(0);

	// and pH as a third, dotted, with no axis of its own
	if (!(await page.locator('.compare-menu').isVisible())) await page.getByText('Compare…').click();
	await page.locator('.compare-menu label', { has: page.locator('span', { hasText: /^pH$/ }) }).click();
	await expect(chart.locator('polyline.compare.c2')).toHaveCount(1);
	await expect(page.locator('.legend')).toContainText('pH · own scale');
	// two is the most: Compare… goes away
	await expect(page.getByText('Compare…')).toHaveCount(0);

	// the readout shows the other readings from the same test
	await chart.locator('.plot').focus();
	await page.keyboard.press('End');
	await expect(chart.locator('.readout')).toContainText('12 ppm');
	await expect(chart.locator('.readout .r-also').nth(0)).toHaveText('Phosphate 0.8 ppm');
	await expect(chart.locator('.readout .r-also').nth(1)).toHaveText('pH 6.9');

	// the address carries the comparison; switching the range keeps it, × takes one off
	const url = page.url();
	await open(page, url);
	await expect(chart.locator('polyline.compare')).toHaveCount(2);
	await page.getByRole('radio', { name: '90 days' }).check({ force: true });
	await expect(page).toHaveURL(/r=3m/);
	await expect(chart.locator('polyline.compare')).toHaveCount(2);
	await page.getByRole('link', { name: 'Stop comparing with Phosphate' }).click();
	await expect(chart.locator('polyline.compare')).toHaveCount(1);
	await expect(chart.locator('text.axis-title.axis2')).toHaveText('pH');
	await page.getByRole('link', { name: 'Stop comparing with pH' }).click();
	await expect(chart.locator('polyline.compare')).toHaveCount(0);
	await expect(page).not.toHaveURL(/[?&]c=/);
});
