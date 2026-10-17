import { expect, test, type Browser } from '@playwright/test';

// The README's screenshots (docs/screenshots), taken from the demo account
// in both themes (opt-in): SCREENSHOTS=1 npx playwright test e2e/readme-screenshots.test.ts --project=desktop
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to retake the README screenshots');
test.setTimeout(180_000);

const DIR = 'docs/screenshots';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const THEMES = ['light', 'dark'] as const;

async function signedIn(browser: Browser, email: string, viewport: { width: number; height: number }, theme: (typeof THEMES)[number]) {
	const phone = viewport.width < 600;
	const ctx = await browser.newContext({ viewport, colorScheme: theme, isMobile: phone, hasTouch: phone, reducedMotion: 'reduce' });
	const page = await ctx.newPage();
	await page.goto('/signin');
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
	return { ctx, page };
}

/** Load a page and let its fonts, photos and charts settle. */
async function settle(page: import('@playwright/test').Page, url: string) {
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.locator('html[data-ready="true"]').waitFor();
	await page.evaluate(() => document.fonts.ready);
	// the dashboard's What's new note after an update isn't part of the picture
	const whatsNew = page.getByRole('button', { name: /Dismiss|Got it/ });
	if (await whatsNew.count()) await whatsNew.first().click();
	await page.waitForTimeout(400);
}

test('README screenshots', async ({ browser, request }, info) => {
	test.skip(info.project.name !== 'desktop', 'taken once, at each size below');
	const seeded = await (await request.post('/dev/seed')).json();
	const tank = seeded.plantedTank as string;

	for (const theme of THEMES) {
		// the dashboard on a computer
		{
			const { ctx, page } = await signedIn(browser, seeded.email, DESKTOP, theme);
			await settle(page, `/?tank=${tank}`);
			await page.screenshot({ path: `${DIR}/desktop-dashboard-${theme}.png` });
			await ctx.close();
		}
		// on a phone: the dashboard, logging a water test, and nitrate on Charts
		{
			const { ctx, page } = await signedIn(browser, seeded.email, PHONE, theme);
			await settle(page, `/?tank=${tank}`);
			await page.screenshot({ path: `${DIR}/phone-dashboard-${theme}.png` });

			await settle(page, `/entries/test/new?tank=${tank}`);
			await page.screenshot({ path: `${DIR}/phone-log-test-${theme}.png` });

			await settle(page, `/charts?tank=${tank}`);
			const nitrate = page.locator('a.chip', { hasText: /^Nitrate/ });
			const url = new URL((await nitrate.getAttribute('href'))!, page.url());
			url.searchParams.set('r', '1m');
			await settle(page, url.pathname + url.search);
			await expect(page.getByRole('slider', { name: /^Nitrate/ })).toBeVisible();
			await page.screenshot({ path: `${DIR}/phone-charts-${theme}.png` });
			await ctx.close();
		}
	}
});
