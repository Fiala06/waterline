import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// What changed? (#89): Charts sums up the latest move in a reading and lists
// what was logged in that stretch, in date order, as facts rather than a cause.

test('Charts lists what was logged while a reading moved', async ({ page }, info) => {
	await newKeeperWithTank(page, `what-changed-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// every test at the same time of day, a few minutes ago (the keeper's zone is UTC), so
	// the span is whole days whatever the hour: logged at 09:00 and "now", it read 13 days
	// late in the day, as the summary rounds the stretch to days
	const base = Date.now() - 5 * 60_000;
	const daysAgo = (n: number) => new Date(base - n * 86_400_000).toISOString().slice(0, 10);
	const time = new Date(base).toISOString().slice(11, 16);

	// nitrate up, then down over 12 days; a dose before the fall, a water change and a trim during it
	for (const [n, v] of [
		[16, '12'],
		[12, '18'],
		[6, '10'],
		[0, '7']
	] as const) {
		await open(page, `/entries/test/new?tank=${tankId}&date=${daysAgo(n)}&time=${time}`);
		await page.getByLabel('Nitrate', { exact: true }).fill(v);
		await page.getByRole('button', { name: 'Save 1 reading' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	}
	await open(page, `/entries/event/new?tank=${tankId}&category=dosing&date=${daysAgo(14)}&time=10:00`);
	await page.getByLabel('Product', { exact: true }).fill('Thrive');
	await page.getByRole('button', { name: 'Save dosing' }).click();
	await expect(page.getByRole('status')).toContainText('✓');
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change&date=${daysAgo(9)}&time=10:00`);
	await page.getByLabel('Amount', { exact: true }).fill('40');
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');
	await open(page, `/entries/event/new?tank=${tankId}&category=maintenance&date=${daysAgo(3)}&time=10:00`);
	await page.getByRole('checkbox', { name: 'Trimmed plants' }).check({ force: true });
	await page.getByRole('button', { name: 'Save maintenance' }).click();
	await expect(page.getByRole('status')).toContainText('✓');

	await open(page, `/charts?tank=${tankId}`);
	const changed = page.getByRole('region', { name: 'What changed?' });
	await expect(changed).toContainText('Nitrate fell from 18 → 7 ppm over 12 days.');
	// in date order, and only what fell in the stretch: the dose before it is not listed
	const items = changed.getByRole('listitem');
	await expect(items).toHaveCount(2);
	await expect(items.nth(0)).toContainText('Water change · 40% · Tap');
	await expect(items.nth(1)).toContainText('Trimmed plants');
	await expect(changed).not.toContainText('Thrive');
	await expect(changed).toContainText('doesn’t say which, if any, moved the reading');
	// each opens its entry
	await items.nth(0).getByRole('link').click();
	await expect(page).toHaveURL(/\/entries\/event\//);
	await expect(page.getByText('Water change · 40% · Tap').first()).toBeVisible();
});
