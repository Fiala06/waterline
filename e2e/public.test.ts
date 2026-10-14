import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('public tank page and photo share link', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `public-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// A test with a private note and a photo
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Nitrate', { exact: true }).fill('35');
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Note').fill('SECRET private note');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 2 readings');
	// an earlier test, three days ago, so the readings have a chart to open
	const earlier = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/entries/test/new?tank=${tankId}&date=${earlier}&time=09:00`);
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByLabel('pH', { exact: true }).fill('7');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 2 readings');
	// a cover photo
	await open(page, `/tanks/${tankId}/settings`);
	await page.locator('input[type=file][name=cover]').setInputFiles(await jpeg('#335577', 'cover.jpg'));
	await expect(page.getByRole('img', { name: /^Tank cover/ })).toBeVisible();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status').filter({ hasText: '✓ Tank saved' })).toBeVisible();

	// Publish
	const slug = `riverbed-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('URL').fill(slug);
	await page.getByLabel('Allow search engines').check({ force: true });
	await page.getByLabel(/Page title/).fill('Riverbed 40: planted tank log');
	await page.getByLabel("What I'm asking about").fill('Nitrate keeps climbing between water changes. What am I missing?');
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();

	// Visitor, signed out
	const visitor = await browser.newContext();
	const v = await visitor.newPage();
	await v.goto(`/t/${slug}`);
	await expect(v.getByRole('heading', { name: 'Riverbed 40', level: 1 })).toBeVisible();
	// the keeper's question leads the page
	await expect(v.locator('blockquote.question')).toHaveText('Nitrate keeps climbing between water changes. What am I missing?');
	// what's out of range, with its target and what it was before
	const nitrate = v.locator('.arow', { hasText: 'Nitrate' });
	await expect(v.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
	await expect(nitrate).toContainText('✕ High');
	await expect(nitrate).toContainText('was 40 on');
	await expect(nitrate.locator('.aval')).toContainText('35');
	// the latest test's time shows with its day
	await expect(v.locator('.by')).toContainText(/Last water test today, \d{1,2}:\d{2} [AP]M/);
	// every tested parameter has a lane on the shared timeline; the range is a link
	const trends = v.locator('section#trends');
	await expect(trends.locator('.lane .ln', { hasText: 'Nitrate' })).toBeVisible();
	await expect(trends.locator('.lane .ln', { hasText: 'pH' })).toBeVisible();
	await expect(trends.locator('svg circle.pt.bad')).toHaveCount(2);
	await trends.getByRole('link', { name: '90 days' }).click();
	await expect(v).toHaveURL(new RegExp(`/t/${slug}\\?chart=90d#trends$`));
	await expect(trends.getByRole('link', { name: '90 days' })).toHaveAttribute('aria-current', 'true');
	await v.goto(`/t/${slug}`);
	// the test log: one row per test, out-of-range shaded; days only while detail is off
	const log = v.locator('section#tests table');
	await expect(log.locator('tbody tr')).toHaveCount(2);
	await expect(log.locator('td.bad').first()).toHaveText(/^35/);
	await expect(log.locator('tbody th').first()).toHaveText(/^\w{3} \d{1,2}$/);
	// the cover opens full size in the lightbox
	await v.locator('a.hero').click();
	const box = v.getByRole('dialog', { name: 'Photo' });
	await expect(box).toBeVisible();
	await expect(box.locator('.lb-cap')).toHaveText(/^\w{3} \d{1,2}, \d{4}$/);
	await v.keyboard.press('Escape');
	await expect(box).toBeHidden();
	await expect(v.locator('body')).not.toContainText('SECRET');
	await expect(v.locator('body')).not.toContainText('Water change 25%'); // tasks are never public
	// the care log names the out-of-range reading (never the test's note)
	await expect(v.locator('section#care')).toContainText('Nitrate 35 high');
	// the data as CSV, and the page as text for a forum post: nothing private in either
	const csv = await (await visitor.request.get(`/t/${slug}/data.csv`)).text();
	expect(csv.split('\r\n')[0]).toContain('Nitrate (ppm)');
	expect(csv).toContain(',35,');
	expect(csv).not.toContain('SECRET');
	const summary = await (await visitor.request.get(`/t/${slug}/summary.txt`)).text();
	expect(summary).toContain('Nitrate keeps climbing');
	expect(summary).toContain('Nitrate 35 ppm (✕ High');
	expect(summary).toContain(`/t/${slug}`);
	expect(summary).not.toContain('SECRET');
	await expect(v).toHaveTitle('Riverbed 40: planted tank log');
	await expect(v.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
	await expect(v.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`/t/${slug}/og\\.png\\?v=`));
	await expect(v.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/t/${slug}$`));

	const og = await visitor.request.get(`/t/${slug}/og.png`);
	expect(og.headers()['content-type']).toBe('image/png');
	expect((await og.body()).subarray(1, 4).toString()).toBe('PNG');

	expect(await (await visitor.request.get('/sitemap.xml')).text()).toContain(`/t/${slug}</loc>`);
	const robots = await (await visitor.request.get('/robots.txt')).text();
	expect(robots).toContain('Allow: /t/');
	expect(robots).toContain('Disallow: /');

	// Detail for people helping: the times of tests and the notes on them (and the schedule) go public
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel(/Detail for people helping me/).check({ force: true });
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	await v.goto(`/t/${slug}`);
	await expect(log.locator('tbody th').first()).toHaveText(/^\w{3} \d{1,2} · \d{1,2}:\d{2} [AP]M$/);
	await expect(log.locator('td.note').first()).toHaveText('SECRET private note');
	await expect(v.locator('.units')).toContainText('All times');
	expect(await (await visitor.request.get(`/t/${slug}/data.csv`)).text()).toContain('SECRET private note');

	// The app itself stays private
	await v.goto('/history');
	await expect(v).toHaveURL(/\/signin/);

	// Photo share link
	await open(page, '/photos');
	await page.locator('a.tile').first().click();
	// phones keep the photo actions in the ••• sheet
	if (info.project.name === 'phone') await page.getByRole('link', { name: 'More', exact: true }).click();
	const linkSwitch = page.getByRole('switch', { name: 'Public link' });
	await linkSwitch.click();
	await expect(linkSwitch).toHaveAttribute('aria-checked', 'true');
	const url = await page.getByRole('textbox', { name: 'Link address' }).inputValue();
	const shareId = url.split('/s/')[1];
	await v.goto(`/s/${shareId}`);
	await expect(v.locator('main img')).toBeVisible();
	await expect(v.locator('body')).not.toContainText('SECRET');
	expect((await visitor.request.get(`/s/${shareId}/image`)).headers()['content-type']).toBe('image/jpeg');

	await linkSwitch.click();
	await expect(page.getByRole('status')).toContainText('Public link turned off');
	expect((await visitor.request.get(`/s/${shareId}`)).status()).toBe(404);

	// Unpublish → 404
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').uncheck({ force: true });
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	expect((await visitor.request.get(`/t/${slug}`)).status()).toBe(404);
	await visitor.close();
});
