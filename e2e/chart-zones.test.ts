import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #74: charts name their zones and leave room past the target, so a run of zeros shows
test('charts show the target, high and low zones, and readings at 0', async ({ page }, info) => {
	await newKeeperWithTank(page, `zones-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'tests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`Date,Time,Ammonia,Nitrate\n${day(15)},09:00,0,10\n${day(8)},09:00,0,18\n${day(1)},09:00,0,30\n`)
	});
	await page.getByRole('button', { name: 'Add 3 water tests' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 3 water tests');

	// ammonia at 0: 0 is its own line, a trace up to the limit, high above it
	await open(page, `/charts?tank=${tankId}`);
	await page.getByRole('link', { name: /^Ammonia/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Ammonia' })).toBeVisible();
	const chart = page.locator('.chart').first();
	await expect(chart.locator('text.zone', { hasText: '✕ High' })).toBeAttached();
	await expect(chart.locator('text.zone', { hasText: '▲ Trace' })).toBeAttached();
	await expect(chart.locator('text.zone', { hasText: '✓ 0 is best' })).toBeAttached();
	// the readings at 0 sit above the axis, not under it
	const dotY = Number(await chart.locator('.last-dot').getAttribute('y')) + 5;
	const axisY = Number(await chart.locator('line.baseline').getAttribute('y1'));
	expect(axisY - dotY).toBeGreaterThanOrEqual(6);

	// nitrate: high over the target, low under it, and the key says what the tint means
	await page.getByRole('link', { name: /^Nitrate/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Nitrate' })).toBeVisible();
	await expect(chart.locator('text.zone', { hasText: '✕ High' })).toBeAttached();
	await expect(chart.locator('text.zone', { hasText: '✓ Target' })).toBeAttached();
	await expect(chart.locator('text.zone', { hasText: '✕ Low' })).toBeAttached();
	await expect(page.getByText('Out of range', { exact: true }).first()).toBeVisible();
});
