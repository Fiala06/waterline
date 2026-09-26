import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('public tank page and photo share link', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `public-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// A test with a private note and a photo
	await open(page, `/log/test?tank=${tankId}`);
	await page.getByLabel(/^Nitrate /).fill('35');
	await page.getByLabel(/^pH /).fill('6.8');
	await page.getByLabel('Note').fill('SECRET private note');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 2 readings');

	// Publish
	const slug = `riverbed-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('Link').fill(slug);
	await page.getByLabel('Allow search engines').check({ force: true });
	await page.getByLabel(/Page title/).fill('Riverbed 40: planted tank log');
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();

	// Visitor, signed out
	const visitor = await browser.newContext();
	const v = await visitor.newPage();
	await v.goto(`/t/${slug}`);
	await expect(v.getByRole('heading', { name: 'Riverbed 40', level: 1 })).toBeVisible();
	await expect(v.getByText('✕ Nitrate high')).toBeVisible();
	await expect(v.getByText('Latest readings')).toBeVisible();
	await expect(v.locator('body')).not.toContainText('SECRET');
	await expect(v.locator('body')).not.toContainText('Water change 25%'); // tasks are never public
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

	// The app itself stays private
	await v.goto('/history');
	await expect(v).toHaveURL(/\/signin/);

	// Photo share link
	await open(page, '/photos');
	await page.locator('a.tile').first().click();
	await page.getByRole('button', { name: 'Create public link' }).click();
	const url = await page.locator('.s-url').innerText();
	const shareId = url.split('/s/')[1];
	await v.goto(`/s/${shareId}`);
	await expect(v.locator('main img')).toBeVisible();
	await expect(v.locator('body')).not.toContainText('SECRET');
	expect((await visitor.request.get(`/s/${shareId}/image`)).headers()['content-type']).toBe('image/jpeg');

	await page.getByRole('button', { name: 'Turn off link' }).click();
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
