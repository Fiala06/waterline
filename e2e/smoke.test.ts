import { expect, test } from '@playwright/test';
import { dateValue, jpeg, newKeeperWithTank, open, openQuickAdd, pickDate } from './helpers';

// The flows that matter most at the tank, in every browser engine (#104): the
// full suite runs on Chromium (desktop and Android); this one also runs on an
// iPhone (WebKit), desktop Safari (WebKit) and desktop Firefox.
// Not here: logging offline. Playwright drives service workers in Chromium
// only, so the offline queue is tested there (e2e/offline.test.ts).

test('sign in, log, add a photo, read the chart, share: the essentials work here', async ({ page, browser, isMobile, browserName }, info) => {
	// setup and a first tank
	await newKeeperWithTank(page, `smoke-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await test.step('log two water tests, with the decimal keypad', async () => {
		for (const no3 of ['10', '45']) {
			await open(page, `/entries/test/new?tank=${tankId}`);
			const field = page.getByLabel('Nitrate', { exact: true });
			await expect(field).toHaveAttribute('inputmode', 'decimal');
			await field.fill(no3);
			await page.getByRole('button', { name: 'Save 1 reading' }).click();
			await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
		}
		await open(page, `/?tank=${tankId}`);
		await expect(page.getByText(/✕ (High|Nitrate high)/).first()).toBeVisible();
	});

	await test.step('a task due tomorrow, picked in the calendar', async () => {
		await open(page, '/tasks/new');
		await page.getByRole('textbox', { name: 'Task' }).fill('Trim stem plants');
		const today = await dateValue(page, 'nextDue');
		await pickDate(page, 'nextDue', new Date(Date.parse(today + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10));
		await page.getByRole('button', { name: 'Save' }).last().click();
		await expect(page.getByRole('status')).toContainText('added');
	});

	await test.step('Quick add opens as a dialog and closes', async () => {
		await open(page, `/?tank=${tankId}`);
		await openQuickAdd(page);
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeHidden();
	});

	await test.step('a note with a photo, and the photo shows', async () => {
		await open(page, `/entries/event/new?tank=${tankId}&category=note`);
		await page.getByLabel('Note').fill('Smoke test note');
		await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
		await page.getByRole('button', { name: 'Save note' }).click();
		await expect(page.getByRole('status')).toContainText('Note saved');
		await open(page, '/photos');
		const img = page.locator('a.tile img').first();
		await expect(img).toBeVisible();
		await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	});

	await test.step('the chart reads out a reading', async () => {
		await open(page, `/?tank=${tankId}`);
		const chart = page.getByRole('slider', { name: /^Nitrate over/ });
		await expect(chart).toHaveAttribute('aria-valuetext', /45 ppm/);
		await chart.focus();
		await page.keyboard.press('End');
		await page.keyboard.press('ArrowLeft');
		await expect(chart.locator('.readout')).toContainText('10 ppm');
	});

	await test.step(isMobile ? 'the bottom bar moves between pages' : 'the tank tabs move between pages', async () => {
		// from the top of the dashboard: the phone's bar slides away while scrolling down
		await open(page, `/?tank=${tankId}`);
		if (isMobile) {
			const bar = page.getByRole('navigation', { name: 'Main' });
			await bar.getByRole('link', { name: 'History' }).click();
			await expect(page).toHaveURL(/\/history/);
			await expect(page.getByText('Smoke test note').first()).toBeVisible();
			await bar.getByRole('link', { name: 'Charts' }).click();
			await expect(page).toHaveURL(/\/charts/);
		} else {
			await page.getByRole('link', { name: 'History', exact: true }).first().click();
			await expect(page).toHaveURL(/\/history/);
			await expect(page.getByText('Smoke test note').first()).toBeVisible();
		}
	});

	await test.step('the public page, for a visitor', async () => {
		const slug = `smoke-${info.project.name}-${Date.now().toString(36)}`;
		await open(page, `/tanks/${tankId}/public`);
		await page.getByLabel('Share this tank').check({ force: true });
		await page.getByLabel('URL').fill(slug);
		await page.getByRole('button', { name: 'Save' }).first().click();
		await expect(page.getByText('✓ Public page saved')).toBeVisible();
		const visitor = await browser.newContext();
		const v = await visitor.newPage();
		await v.goto(`/t/${slug}`);
		await expect(v.getByRole('heading', { name: 'Riverbed 40', level: 1 })).toBeVisible();
		await expect(v.locator('body')).not.toContainText('Smoke test note');
		await visitor.close();
	});

});
