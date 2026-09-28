import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

// Species photos from Wikimedia Commons (a stand-in here: src/routes/dev/wiki),
// and the keeper's own photos of a plant or an animal.

test('plants and livestock get a species photo with its credit, and can have your own instead', async ({ page }, info) => {
	await newKeeperWithTank(page, `species-photos-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a plant with a free photo, one whose photo isn't free, and one with no page
	await open(page, `/tanks/${tankId}/plants/several`);
	const search = page.getByLabel('Search plants');
	await search.fill('java fern');
	await page.getByRole('button', { name: /^Java fern/ }).first().click();
	await search.fill('anubias');
	await page.getByRole('button', { name: /^Anubias/ }).first().click();
	await search.fill('Mystery weed');
	await page.getByRole('button', { name: /Add “Mystery weed”/ }).click();
	await page.getByRole('button', { name: 'Add 3 plants' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Added 3 plants');

	// the photo comes in the background; the page looks again by itself
	const fern = page.getByRole('button', { name: /^Java fern/ }).first();
	await expect(fern.locator('img')).toHaveAttribute('src', /^\/stock\/[0-9a-f]{40}\.jpg$/, { timeout: 15_000 });
	await expect(page.getByRole('button', { name: /^Anubias/ }).first().locator('img')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Mystery weed/ }).locator('img')).toHaveCount(0);
	const src = await fern.locator('img').getAttribute('src');
	expect((await page.request.get(src!)).headers()['content-type']).toBe('image/jpeg');

	// its sheet: the photo, and its credit
	await fern.click();
	const sheet = page.getByRole('dialog', { name: /Java fern/ });
	await expect(sheet.getByText('Photo: Jane Doe · CC BY-SA 4.0 ·')).toBeVisible();
	await expect(sheet.getByRole('link', { name: 'Wikimedia Commons' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Java_fern.jpg');

	// your own photo instead
	await sheet.locator('input[type=file][name=photo]').setInputFiles(await jpeg('#aa3355', 'my-fern.jpg'));
	await expect(page.getByRole('status')).toContainText('✓ Photo saved');
	await expect(fern.locator('img')).toHaveAttribute('src', /^\/media\//);
	await fern.click();
	await expect(sheet.getByText('Photo: Jane Doe')).toHaveCount(0);
	await sheet.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('status')).toContainText('Photo removed');
	await expect(fern.locator('img')).toHaveAttribute('src', /^\/stock\//);

	// livestock: the species photo in the list and on its page
	await open(page, `/tanks/${tankId}/livestock/several`);
	await page.getByLabel('Search species').fill('neon tetra');
	await page.getByRole('button', { name: /^Neon tetra/ }).first().click();
	await page.getByRole('button', { name: /^Add 1 animal/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Added 1 animal');
	await expect(page.locator('.lthumb').first()).toHaveAttribute('src', /^\/stock\//, { timeout: 15_000 });
	await page.getByRole('link', { name: 'Neon tetra' }).first().click();
	await expect(page.getByText('Species photo: Jane Doe · CC BY 2.0 ·')).toBeVisible();

	// a photo from Photos, as the neon tetras' photo
	await open(page, '/photos');
	await page.locator('a[href^="/photos/"]').first().click();
	await page.getByLabel('Use as the photo for').selectOption({ label: 'Neon tetra' });
	await page.getByRole('button', { name: 'Use', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('✓ The photo for Neon tetra');
	await expect(page.getByRole('complementary', { name: 'Photo details' }).getByText('✓ The photo for Neon tetra')).toBeVisible();
	await open(page, `/tanks/${tankId}/livestock`);
	await expect(page.locator('.lthumb').first()).toHaveAttribute('src', /^\/media\//);
});
