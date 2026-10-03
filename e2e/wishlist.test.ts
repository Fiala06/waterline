import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #24: plan fish and gear on the wish list, add one to the tank with its purchase in Spending, delete with Undo.
test('wish list: plan, add to tank, undo a delete', async ({ page }) => {
	await newKeeperWithTank(page, 'wish');
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/wishlist`);
	await expect(page.getByRole('heading', { name: /Planned · 0/ })).toBeVisible();
	await expect(page.getByText('Nothing on the list yet.')).toBeVisible();

	// six ember tetras at $18, with a note
	await page.locator('#wish-name').fill('Ember tetra');
	await page.locator('.count-stepper').getByRole('button', { name: 'More' }).click();
	await page.getByLabel('How many').fill('6');
	await page.getByLabel('Price · optional').fill('18');
	await page.getByLabel('Note · optional').fill('Once the plants have grown in');
	await page.getByRole('button', { name: 'Add to wish list' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Ember tetra on the wish list');
	await expect(page.getByRole('heading', { name: /Planned · 1 · about \$18\.00/ })).toBeVisible();
	const tetras = page.locator('li.wish', { hasText: '6 Ember tetra' });
	await expect(tetras).toContainText('Fish');
	await expect(tetras).toContainText('Once the plants have grown in');

	// a filter with a link: the kind of equipment and the shop's host show
	await page.locator('.segmented label', { hasText: 'Equipment' }).click();
	await page.locator('#wish-name').fill('Fluval 307');
	await page.getByLabel('Kind of equipment').selectOption('filter');
	await page.getByLabel('Price · optional').fill('120');
	await page.getByLabel('Link · optional').fill('https://shop.example.com/fluval-307');
	await page.getByRole('button', { name: 'Add to wish list' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Fluval 307 on the wish list');
	await expect(page.getByRole('heading', { name: /Planned · 2 · about \$138\.00/ })).toBeVisible();
	const filter = page.locator('li.wish', { hasText: 'Fluval 307' });
	await expect(filter).toContainText('Filter · shop.example.com');
	await expect(page.locator('#wish-name')).toHaveValue('');
	await expect(page.getByLabel('Price · optional')).toHaveValue('');

	// a price that isn't one is refused, and the list keeps what was typed
	await page.locator('.segmented label', { hasText: 'Plant' }).click();
	await page.locator('#wish-name').fill('Java fern');
	await page.getByLabel('Price · optional').fill('cheap');
	await page.getByRole('button', { name: 'Add to wish list' }).click();
	await expect(page.getByText('✕ Enter a price, like 12.50.')).toBeVisible();
	await expect(page.locator('#wish-name')).toHaveValue('Java fern');

	// Add to tank: the tetras go to Livestock, the purchase to Spending
	await tetras.getByRole('button', { name: 'Add to tank' }).click();
	await expect(tetras.getByText(/Adds .*6 Ember tetra.* to Livestock today/)).toBeVisible();
	await expect(tetras.getByLabel('Paid')).toHaveValue('18');
	await tetras.getByRole('button', { name: 'Add to tank' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ 6 Ember tetra added to Livestock · logged in Spending');
	await expect(page.getByRole('heading', { name: /Planned · 1 · about \$120\.00/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Added to the tank · 1/ })).toBeVisible();
	await expect(page.locator('li.wish.done', { hasText: 'Ember tetra' })).toContainText('Fish · added');
	await open(page, `/tanks/${tankId}/livestock`);
	await expect(page.getByRole('link', { name: 'Ember tetra', exact: true })).toBeVisible();
	await expect(page.getByText('6 animals · 1 species')).toBeVisible();
	await open(page, `/tanks/${tankId}/spending`);
	await expect(page.getByText('6 Ember tetra')).toBeVisible();
	await expect(page.getByText('$18.00').first()).toBeVisible();
	await open(page, '/history');
	await expect(page.getByText(/Ember tetra/).first()).toBeVisible();

	// Delete with Undo
	await open(page, `/tanks/${tankId}/wishlist`);
	await page.locator('li.wish', { hasText: 'Fluval 307' }).getByRole('button', { name: /^Delete/ }).click();
	await expect(page.getByRole('status')).toContainText('Fluval 307 taken off the wish list');
	await expect(page.getByRole('heading', { name: /Planned · 0/ })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Fluval 307 is back on the list');
	await expect(page.locator('li.wish', { hasText: 'Fluval 307' })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Planned · 1 · about \$120\.00/ })).toBeVisible();
});
