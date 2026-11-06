import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// A spec can be a sentence (a light's spectrum, pasted from the box): on the
// Equipment tab it wraps inside its card instead of running over the next one.
test('a long spec wraps inside its equipment card', async ({ page }, info) => {
	await newKeeperWithTank(page, `long-spec-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const spectrum = 'Advanced Spectrum V3.0 – Six-color RGB + plant growth LEDs for the broadest, most natural colour rendering';

	for (const [type, brand, extra] of [
		['Light', 'Twinstar', spectrum],
		['Heater', 'Tidewell', null]
	] as const) {
		await open(page, `/tanks/${tankId}/equipment/new`);
		await page.locator('label', { hasText: new RegExp(`^${type}$`) }).click();
		await page.getByLabel('Brand').fill(brand);
		if (extra) await page.getByLabel('Spectrum').fill(extra);
		await page.getByRole('button', { name: 'Save' }).last().click();
		await expect(page.getByRole('status')).toBeVisible();
	}

	await open(page, `/tanks/${tankId}/equipment`);
	const card = page.locator('.eq-card', { hasText: 'Twinstar' });
	const tag = card.locator('.specs .tag', { hasText: 'Advanced Spectrum' });
	await expect(tag).toBeVisible();
	const c = (await card.boundingBox())!;
	const t = (await tag.boundingBox())!;
	expect(t.x + t.width).toBeLessThanOrEqual(c.x + c.width + 1);
	// and no card is wider than the page
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
