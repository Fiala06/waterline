import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// GH and KH in degrees (drop kits: 1 drop = 1°) or ppm, and a nudge when a
// ppm value looks like drops × 10.

test('hardness in degrees or ppm, with a nudge for drops typed as ppm', async ({ page }, info) => {
	await newKeeperWithTank(page, `hardness-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// degrees (the default): how to read a drop kit, until a value is in
	await open(page, `/entries/test/new?tank=${tankId}`);
	const gh = page.getByLabel('GH', { exact: true });
	await expect(page.getByText('1 drop = 1° on API/JBL/Tetra kits.')).toHaveCount(2);
	await gh.fill('6');
	await expect(page.getByText('1 drop = 1° on API/JBL/Tetra kits.')).toHaveCount(1);
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	// ppm: the same reading, about 107
	await open(page, '/settings');
	const saved = page.waitForResponse((r) => r.url().includes('/settings?/save') && r.ok());
	await page.locator('#hardnessUnit').selectOption('ppm');
	await saved;
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect(page.getByText('Last 107 ·').first()).toBeVisible();
	await expect(page.getByText('1 drop = 1°')).toHaveCount(0);

	// 80 ppm reads like 8 drops × 10: one tap makes it ppm
	await gh.fill('80');
	const nudge = page.getByText('80 looks like 8 drops × 10. 8 drops are about 143 ppm (× 17.9).');
	await expect(nudge).toBeVisible();
	await expect(page.getByRole('link', { name: 'Settings' }).last()).toHaveAttribute('href', '/settings#units');
	await page.getByRole('button', { name: 'Use 143 ppm' }).click();
	await expect(gh).toHaveValue('143');
	await expect(nudge).toHaveCount(0);

	// a small 7 is 7 drops
	await gh.fill('7');
	await expect(page.getByText('Counted drops? 7 drops are about 125 ppm (× 17.9).')).toBeVisible();
	await page.getByRole('button', { name: 'Use 125 ppm' }).click();
	await expect(gh).toHaveValue('125');
	await expect(page.getByRole('button', { name: /^Use \d+ ppm$/ })).toHaveCount(0);

	// what looks like ppm is left alone, and can be saved as typed
	await gh.fill('54');
	await expect(page.getByRole('button', { name: /^Use \d+ ppm$/ })).toHaveCount(0);
});
