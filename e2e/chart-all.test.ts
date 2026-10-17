import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Every parameter on one chart, each against its own target
test('charts show all parameters together, each against its target', async ({ page }, info) => {
	await newKeeperWithTank(page, `chart-all-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'tests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`Date,Time,pH,Ammonia,Nitrate\n${day(15)},09:00,7.0,0,10\n${day(8)},09:00,7.2,0,18\n${day(1)},09:00,7.4,0.5,30\n`)
	});
	await page.getByRole('button', { name: 'Add 3 water tests' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 3 water tests');

	await open(page, `/charts?tank=${tankId}`);
	await page.getByRole('link', { name: /^All/ }).first().click();
	await expect(page.getByRole('heading', { name: 'All parameters' })).toBeVisible();
	const chart = page.getByRole('slider', { name: 'Every parameter against its target over time' });
	for (const name of ['pH', 'Ammonia', 'Nitrate']) await expect(chart.locator(`g.series[data-param="${name}"]`)).toBeAttached();
	await expect(chart.locator('text.zone', { hasText: '✓ Target' })).toBeAttached();

	// the latest test, read out with every reading in it
	await expect(chart).toHaveAttribute('aria-valuetext', /pH 7\.4, OK; Ammonia 0\.5 ppm, High; Nitrate 30 ppm, High$/);
	await chart.focus();
	await page.keyboard.press('End');
	await expect(chart.locator('.readout')).toContainText('30 ppm');
	await expect(chart.locator('.readout')).toContainText('✕ High');
	await page.keyboard.press('Escape');

	// a key takes its line off the chart, and puts it back
	const key = page.getByRole('button', { name: 'Nitrate', exact: true });
	await key.click();
	await expect(key).toHaveAttribute('aria-pressed', 'false');
	await expect(chart.locator('g.series[data-param="Nitrate"]')).toHaveCount(0);
	await key.click();
	await expect(chart.locator('g.series[data-param="Nitrate"]')).toBeAttached();

	// beside it, the latest of each, with its status in words
	const nitrate = page.locator('.latest-list a', { hasText: 'Nitrate' });
	await expect(nitrate).toContainText('30 ppm');
	await expect(nitrate).toContainText('✕ High');
	await nitrate.click();
	await expect(page.getByRole('heading', { name: 'Nitrate' })).toBeVisible();
});
