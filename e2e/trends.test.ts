import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('an earlier time in one tap', async ({ page }, info) => {
	await newKeeperWithTank(page, `quick-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: /Now ▾/ }).click();
	const sheet = page.getByRole('dialog');
	await expect(sheet.getByRole('button', { name: /^1 hour ago/ })).toBeVisible();
	await sheet.getByRole('button', { name: /^Yesterday evening/ }).click();
	await expect(page.getByRole('button', { name: /· 6:00 PM ▾/ })).toBeVisible();
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Water change · 25% · Tap 6:00 PM/ })).toBeVisible();
});

test('the dashboard points out a run of rising tests', async ({ page }, info) => {
	await newKeeperWithTank(page, `trends-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	for (const [n, v] of [
		[12, '8'],
		[9, '10'],
		[6, '12'],
		[3, '14']
	] as const) {
		await open(page, `/entries/test/new?tank=${tankId}&date=${daysAgo(n)}&time=09:00`);
		await page.getByLabel('Nitrate', { exact: true }).fill(v);
		await page.getByRole('button', { name: 'Save 1 reading' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	}

	await open(page, `/?tank=${tankId}`);
	const note = page.getByRole('button', {
		name: /^Nitrate has risen in each of your last 3 tests \(8 → 14 ppm\) and is on course to pass 20 ppm in about \d+ days\.$/
	});
	await expect(note).toBeVisible();
	await note.click();
	await expect(note).toHaveAttribute('aria-pressed', 'true');

	// what an assistant reads too
	await open(page, `/tanks/${tankId}/summary`);
	await expect(page.getByLabel('The summary')).toContainText('## Trends\n\n- Nitrate has risen in each of your last 3 tests (8 → 14 ppm)');
});

test('the dashboard points out a drift between water changes', async ({ page }, info) => {
	await newKeeperWithTank(page, `drift-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	// three weekly water changes; KH falls 1 dKH in the 4 days after each
	for (const wc of [21, 14, 7]) {
		await open(page, `/entries/event/new?tank=${tankId}&category=water_change&date=${daysAgo(wc)}&time=10:00`);
		await page.getByRole('button', { name: 'Save water change' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Water change logged');
		for (const [n, v] of [
			[wc - 1, '5'],
			[wc - 5, '4']
		] as const) {
			await open(page, `/entries/test/new?tank=${tankId}&date=${daysAgo(n)}&time=09:00`);
			await page.getByLabel('KH', { exact: true }).fill(v);
			await page.getByRole('button', { name: 'Save 1 reading' }).click();
			await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
		}
	}
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText('KH drifts down about 2 dKH a week between water changes (in 3 of your last 3).')).toBeVisible();
	await open(page, `/tanks/${tankId}/summary`);
	await expect(page.getByLabel('The summary')).toContainText('- KH drifts down about 2 dKH a week between water changes');
});

test('Charts compares a parameter with the other tanks', async ({ page }, info) => {
	await newKeeperWithTank(page, `compare-${info.project.name}`);
	const first = new URL(page.url()).searchParams.get('tank')!;
	const log = async (tank: string, nitrate: string) => {
		await open(page, `/entries/test/new?tank=${tank}`);
		await page.getByLabel('Nitrate', { exact: true }).fill(nitrate);
		await page.getByRole('button', { name: 'Save 1 reading' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	};
	await log(first, '12');
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Shrimp 10');
	await page.locator('label', { hasText: 'Freshwater' }).click();
	await page.getByLabel('Volume').fill('10');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank created');
	const second = new URL(page.url()).searchParams.get('tank')!;
	await log(second, '30');

	// Nitrate, the one parameter with a reading, is the chart it opens on
	await open(page, `/charts?tank=${first}`);
	const compare = page.getByRole('region', { name: 'Nitrate in your other tanks' });
	await expect(compare).toBeVisible();
	await expect(compare.getByRole('link', { name: 'Shrimp 10' })).toBeVisible();
	await expect(compare).toContainText('30 ppm');
	await expect(compare).toContainText('✕ High');
});
