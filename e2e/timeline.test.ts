import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open, pickDate } from './helpers';

// #26: photos in date order with the readings of the moment, what changed between, before and after, and the public section.
test('tank timeline: moments, what changed, compare, public', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `tl-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// two water tests, twelve days apart, and six tetras added in between
	await open(page, `/entries/test/new?tank=${tankId}&date=2025-03-07&time=18:00`);
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');
	await open(page, `/entries/test/new?tank=${tankId}&date=2025-03-19&time=18:00`);
	await page.getByLabel('Nitrate', { exact: true }).fill('10');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').fill('Ember tetra');
	await page.locator('#count-in').fill('6');
	await pickDate(page, 'addedAt', '2025-03-12');
	await page.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('Ember tetra');

	// two photos, each dated by its details
	await open(page, '/photos');
	await page.locator('input[type=file][name=photos]').setInputFiles([
		await jpeg('#2a8c84', 'before.jpg', { at: '2025:03:08 15:20:00' }),
		await jpeg('#c8a040', 'after.jpg', { at: '2025:03:20 15:20:00' })
	]);
	await expect(page.getByRole('status')).toContainText('✓ 2 photos added on 2 days');

	// The timeline: oldest first, each with its nearest test's readings and the stock of the moment
	await page.getByRole('link', { name: 'Timeline' }).first().click();
	await expect(page).toHaveURL(/\/timeline\?tank=/);
	await expect(page.getByRole('heading', { name: 'March 2025' })).toBeVisible();
	const entries = page.locator('article.entry');
	await expect(entries).toHaveCount(2);
	await expect(entries.nth(0)).toContainText('Mar 8, 2025');
	await expect(entries.nth(0)).toContainText('40 ppm');
	await expect(entries.nth(0)).toContainText('✕ High');
	await expect(entries.nth(0)).toContainText('Tested 1 day earlier');
	await expect(entries.nth(1)).toContainText('Mar 20, 2025');
	await expect(entries.nth(1)).toContainText('6 animals');
	await expect(entries.nth(1)).toContainText('✓ OK');
	// what changed between
	const gap = page.locator('.gap');
	await expect(gap).toHaveCount(1);
	await expect(gap).toContainText('12 days');
	await expect(gap).toContainText('+6 Ember tetra · nitrate 40 → 10 ppm');

	// Before and after
	await entries.nth(0).getByRole('link', { name: 'Compare' }).click();
	await expect(page.locator('.picking')).toContainText('Comparing from Mar 8, 2025');
	await entries.nth(1).getByRole('link', { name: 'Compare with this' }).click();
	await expect(page.getByRole('heading', { name: 'Before and after · 12 days' })).toBeVisible();
	const sides = page.locator('.side');
	await expect(sides.nth(0)).toContainText('Before · Mar 8, 2025');
	await expect(sides.nth(1)).toContainText('After · Mar 20, 2025 · 6 animals');
	await expect(page.locator('.changed')).toContainText('In between: +6 Ember tetra · nitrate 40 → 10 ppm');
	await expect(page.locator('#split')).toBeAttached();
	await page.getByRole('link', { name: 'Done comparing' }).click();
	await expect(page.locator('.compare')).toHaveCount(0);

	// A photo left out from its page drops off the timeline, and comes back
	await entries.nth(1).locator('a.thumb').click();
	await expect(page).toHaveURL(/\/photos\//);
	const photoUrl = page.url();
	if (info.project.name === 'phone') await page.getByRole('link', { name: 'More', exact: true }).click();
	await page.getByRole('button', { name: 'Leave out of timeline' }).click();
	await expect(page.getByRole('status')).toContainText('Left out of the timeline');
	await open(page, `/timeline?tank=${tankId}`);
	await expect(page.locator('article.entry')).toHaveCount(1);
	await open(page, photoUrl);
	if (info.project.name === 'phone') await page.getByRole('link', { name: 'More', exact: true }).click();
	await page.getByRole('button', { name: 'Put in timeline' }).click();
	await expect(page.getByRole('status')).toContainText('✓ In the timeline');

	// The public page's Timeline section, following its switches
	const slug = `tl-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('URL').fill(slug);
	await page.getByLabel('Timeline').check({ force: true });
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	const visitor = await browser.newContext();
	const v = await visitor.newPage();
	await v.goto(`/t/${slug}`);
	const tl = v.locator('section.timeline');
	await expect(tl.getByRole('heading', { name: 'Timeline' })).toBeVisible();
	await expect(tl.locator('li.tl-entry')).toHaveCount(2);
	await expect(tl.locator('li.tl-entry').first()).toContainText('Mar 8, 2025');
	await expect(tl.locator('li.tl-entry').first()).toContainText('✕ High');
	await expect(tl.locator('li.tl-gap')).toContainText('12 days · +6 Ember tetra · nitrate 40 → 10 ppm');
	// readings off: the dates stay, the values go
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Latest readings').uncheck({ force: true });
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	await v.reload();
	await expect(tl.locator('li.tl-entry').first()).toContainText('Mar 8, 2025');
	await expect(tl).not.toContainText('40 ppm');
	await expect(tl.locator('li.tl-gap')).toContainText('12 days · +6 Ember tetra');
	await expect(tl.locator('li.tl-gap')).not.toContainText('nitrate');

	// a photo opens in the lightbox, with next/previous and Esc, instead of leaving the page
	await tl.locator('a.tl-shot').first().click();
	const box = v.getByRole('dialog', { name: 'Photo' });
	await expect(box).toBeVisible();
	await expect(box.locator('.lb-cap')).toHaveText('Mar 8, 2025 · 1 of 2');
	await expect(box.locator('img')).toHaveAttribute('src', /\/p\//);
	await v.keyboard.press('ArrowRight');
	await expect(box.locator('.lb-cap')).toHaveText('Mar 20, 2025 · 2 of 2');
	await v.keyboard.press('Escape');
	await expect(box).toBeHidden();
	await expect(v).toHaveURL(new RegExp(`/t/${slug}$`));

	// the chart is the full one, as on Charts: points, limit labels and the Date axis
	await v.goto(`/t/${slug}?chart=all`);
	const chart = v.locator('section.chart');
	await expect(chart.locator('svg text', { hasText: 'Date' })).toBeVisible();
	await expect(chart.locator('svg .last-dot')).toBeVisible();
	await visitor.close();
});
