import { expect, test } from '@playwright/test';

// #243: the fonts on every first screen are fetched with the page, so a first visit doesn't reflow
test('the body and heading weights of Archivo are preloaded', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await page.goto('/signin');
	for (const w of ['400', '800']) {
		const link = page.locator(`head link[rel="preload"][as="font"][href$="/fonts/Archivo-${w}.woff2"]`);
		await expect(link).toHaveCount(1);
		await expect(link).toHaveAttribute('crossorigin', '');
		expect((await page.request.get(`/fonts/Archivo-${w}.woff2`)).status()).toBe(200);
	}
});
