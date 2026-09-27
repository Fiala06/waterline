import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('pets: naming one of a group gives it its own entry, page and history', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `pets-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// six corys, a custom name
	await open(page, `${base}/livestock/new`);
	await page.getByLabel('Species').fill('Corydoras');
	await page.keyboard.press('Escape');
	await page.getByLabel('Count', { exact: true }).fill('6');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 6 Corydoras');

	// name one of them: it moves out of the group onto its own page
	await page.getByRole('link', { name: 'Corydoras', exact: true }).click();
	await expect(page.locator('.hero').getByRole('heading', { name: 'Corydoras ×6', level: 1 })).toBeVisible();
	await page.getByLabel('Name one of them').fill('Pepper');
	await page.getByRole('button', { name: 'Name', exact: true }).click();
	await expect(page.locator('.hero').getByRole('heading', { name: 'Pepper', level: 1 })).toBeVisible();
	await expect(page.locator('.species')).toHaveText('Corydoras');
	await expect(page.getByRole('link', { name: /Named Pepper · Corydoras/ })).toBeVisible();

	// notes and a photo, kept with the pet
	await page.getByLabel('Notes').fill('Hides under the driftwood');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved');
	await page.locator('#pet-photo').setInputFiles(await jpeg());
	await expect(page.getByRole('link', { name: 'Photo of Pepper' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
	await page.reload();
	await expect(page.getByLabel('Notes')).toHaveValue('Hides under the driftwood');

	// renamed, in History too
	await page.getByLabel('Name', { exact: true }).fill('Salt');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.hero').getByRole('heading', { name: 'Salt', level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: /Renamed Pepper to Salt · Corydoras/ })).toBeVisible();

	// the list: the group, then the pet; one species. A pet is one animal.
	await open(page, `${base}/livestock`);
	await expect(page.getByText('6 animals · 1 species')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Salt · Corydoras', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'One more Salt · Corydoras' })).toBeDisabled();

	// more corys join the group, not the pet
	await open(page, `${base}/livestock/new`);
	await page.getByLabel('Species').fill('Corydoras');
	await page.keyboard.press('Escape');
	await page.getByLabel('Count', { exact: true }).fill('2');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 2 Corydoras');
	await expect(page.getByText('8 animals · 1 species')).toBeVisible();
	await page.getByRole('link', { name: 'Corydoras', exact: true }).click();
	await expect(page.locator('.hero').getByRole('heading', { name: 'Corydoras ×7', level: 1 })).toBeVisible();

	// the dashboard's "In the tank" names it
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText(/Salt · Corydoras/).first()).toBeVisible();

	// the public page never shows a pet's name: species only, counted together
	const slug = `pets-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `${base}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('URL').fill(slug);
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	const visitor = await browser.newContext();
	const v = await visitor.newPage();
	await v.goto(`/t/${slug}`);
	await expect(v.getByText('Corydoras').first()).toBeVisible();
	await expect(v.locator('body')).not.toContainText('Salt');
	await expect(v.locator('body')).not.toContainText('Pepper');
	await visitor.close();
});

test('pets can be named without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `pets-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').fill('Betta');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 1 Betta');

	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/livestock`);
	await plain.getByRole('link', { name: 'Betta', exact: true }).click();
	// one animal: its name is a field, no splitting
	await expect(plain.getByLabel('Name one of them')).toHaveCount(0);
	await plain.getByLabel('Name', { exact: true }).fill('Captain');
	await plain.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(plain.locator('.hero').getByRole('heading', { name: 'Captain', level: 1 })).toBeVisible();
	await plain.goto(`/tanks/${tankId}/livestock`);
	await expect(plain.getByRole('link', { name: 'Captain · Betta', exact: true })).toBeVisible();
	await ctx.close();
});
