import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('charts say what they show, and read out a reading on hover, tap or the arrow keys', async ({ page }, info) => {
	await newKeeperWithTank(page, `chart-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// three tests in the last few weeks, from a spreadsheet
	const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'tests.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(`Date,Time,Nitrate\n${day(15)},09:00,10\n${day(8)},09:00,18\n${day(1)},09:00,30\n`)
	});
	await page.getByRole('button', { name: 'Add 3 water tests' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 3 water tests');

	await open(page, `/?tank=${tankId}`);
	const chart = page.getByRole('slider', { name: 'Nitrate over the last 4 weeks' });
	// the axes: what's plotted up the side, dates along the bottom
	await expect(chart.locator('.axis-title')).toHaveText('Nitrate (ppm)');
	await expect(chart.locator('text.axis', { hasText: 'Today' })).toBeAttached();

	// the latest reading, for a screen reader; the arrow keys go back through them
	await expect(chart).toHaveAttribute('aria-valuetext', /: 30 ppm, (High|10 over target)$/);
	await chart.focus();
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowLeft');
	await expect(chart).toHaveAttribute('aria-valuetext', /: 18 ppm, OK$/);
	await expect(chart.locator('.readout')).toContainText('18 ppm');
	await page.keyboard.press('Escape');
	await expect(chart.locator('.readout')).toHaveCount(0);

	// pointing at the line (a hover on desktop, a tap on a phone)
	// in the middle of the screen, clear of the phone's + button
	await chart.evaluate((el) => el.scrollIntoView({ block: 'center' }));
	const box = (await chart.boundingBox())!;
	await page.mouse.click(box.x + box.width - 12, box.y + box.height / 2);
	await expect(chart.locator('.readout')).toContainText('30 ppm');
	await expect(chart.locator('.readout')).toContainText(/✕ (High|10 over target)/);
	await expect(chart.locator('.readout')).toContainText(/\d{4} · \d{1,2}:\d{2}\s?[AP]M/);
});
