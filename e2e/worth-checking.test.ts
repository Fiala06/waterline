import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Worth checking (#95): a plant symptom or an algae entry lists what keepers
// usually look at for it, read against the tank's own records; never a diagnosis.

test('a plant symptom and an algae entry list what is worth checking, with the tank’s own data', async ({ page }, info) => {
	await newKeeperWithTank(page, `worth-${info.project.name}`); // planted
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// a plant, a nitrate reading and a dose, so some checks have data and some don't
	await open(page, `/entries/event/new?tank=${tankId}&category=livestock`);
	await page.locator('label', { hasText: /^Plant$/ }).click();
	await page.getByLabel('Species').pressSequentially('Red stem bunch', { delay: 20 });
	await page.getByRole('button', { name: 'Save change' }).click();
	await expect(page.getByRole('status')).toContainText('added to Plants');
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Nitrate', { exact: true }).fill('12');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await open(page, `/entries/event/new?tank=${tankId}&category=dosing`);
	await page.getByLabel('Product', { exact: true }).fill('Thrive');
	await page.getByRole('button', { name: 'Save dosing' }).click();
	await expect(page.getByRole('status')).toContainText('✓');

	// pinholes on it
	await open(page, `${base}/plants/health`);
	await page.locator('label.chip', { hasText: 'Pinholes' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Plant health logged');

	// the plant's sheet: potassium has no readings, the dose is there, photos to compare
	await page.getByRole('button', { name: /Red stem bunch/ }).first().click();
	const checks = page.locator('dialog[open]').getByRole('region', { name: 'Worth checking' });
	await expect(checks.getByRole('heading', { name: 'Red stem bunch: pinholes noted.' })).toBeVisible();
	await expect(checks).toContainText('often talked about with potassium, but other things do it too');
	const items = checks.getByRole('listitem');
	await expect(items.nth(0)).toContainText('Potassium: no readings yet.');
	await expect(items.nth(0).getByRole('link', { name: 'Log a test ›' })).toHaveAttribute('href', `/entries/test/new?tank=${tankId}`);
	await expect(items.nth(1)).toContainText('Older leaves wear out first');
	await expect(items.nth(2)).toContainText('Last dose (a recent change in fertilizer): Thrive · today.');
	await expect(items.nth(2).getByRole('link', { name: 'Dosing history ›' })).toHaveAttribute('href', `/history?tank=${tankId}&cat=dosing`);
	await expect(checks).toContainText('not a diagnosis');
	await page.keyboard.press('Escape');

	// a thriving note replaces it: nothing to check
	await open(page, `${base}/plants/health`);
	await page.locator('label.chip', { hasText: 'Thriving' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Plant health logged');
	await page.getByRole('button', { name: /Red stem bunch/ }).first().click();
	await expect(page.locator('dialog[open]').getByRole('region', { name: 'Worth checking' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// an algae entry: its kind's checks, with the nitrate reading and the unset light
	await open(page, `${base}/algae`);
	await page.locator('label.chip', { hasText: 'Cyanobacteria' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Algae logged');
	await open(page, `/history?tank=${tankId}`);
	await page.getByRole('link', { name: /Algae · Cyanobacteria/ }).first().click();
	const entry = page.getByRole('region', { name: 'Worth checking' });
	await expect(entry.getByRole('heading', { name: 'Cyanobacteria / BGA algae noted.' })).toBeVisible();
	await expect(entry.getByRole('listitem').nth(0)).toContainText('Nitrate (often very low): 12 ppm · ✓ OK · today.');
	await expect(entry.getByRole('listitem').nth(0).getByRole('link', { name: 'Chart ›' })).toHaveAttribute('href', new RegExp(`/charts\\?tank=${tankId}&p=`));
	await expect(entry.getByRole('listitem').nth(2)).toContainText('Light: no schedule set');
});
