import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #265: a school's count typed in, Remove all, Remove from an animal's own page, and a plant renamed
test('remove a school at once, remove a pet from its page, rename a plant', async ({ page }, info) => {
	await newKeeperWithTank(page, `counts-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;
	const add = async (name: string, count: string) => {
		await open(page, `${base}/livestock/new`);
		await page.getByLabel('Species').fill(name);
		await page.keyboard.press('Escape');
		await page.getByLabel('Count', { exact: true }).fill(count);
		await page.getByRole('button', { name: 'Add' }).last().click();
		await expect(page.getByRole('status')).toContainText(`✓ Added ${count} ${name}`);
	};
	await add('Harlequin rasbora', '12');
	await add('Otocinclus', '6');

	// one tap opens the count; type the new one in
	await page.getByRole('button', { name: 'One fewer Harlequin rasbora' }).click();
	const count = page.getByLabel('New count of Harlequin rasbora');
	await expect(count).toHaveValue('11');
	await count.fill('4');
	await page.getByRole('button', { name: 'Rehomed' }).click();
	await expect(page.getByRole('status')).toContainText('Harlequin rasbora 12 → 4');

	// a count that isn't a change, or isn't a number, can't be saved
	await page.getByRole('button', { name: 'One fewer Harlequin rasbora' }).click();
	await count.fill('4');
	await expect(page.getByText('No change to save.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Loss' })).toHaveCount(0);

	// Remove all sets it to 0; the reason still saves it
	await page.getByRole('button', { name: 'Remove all' }).click();
	await expect(count).toHaveValue('0');
	await page.getByRole('button', { name: 'Loss' }).click();
	await expect(page.getByRole('status')).toContainText('Harlequin rasbora 4 → 0');
	await expect(page.getByRole('button', { name: 'One fewer Harlequin rasbora' })).toHaveCount(0);

	// an animal's own page: Remove from tank, then the reason
	await page.getByRole('link', { name: 'Otocinclus', exact: true }).click();
	await page.getByText('Remove from tank').click();
	await expect(page.getByText('All 6 Otocinclus move to past livestock')).toBeVisible();
	await page.getByRole('button', { name: 'Loss' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Otocinclus removed · loss');
	await expect(page).toHaveURL(new RegExp(`${base}/livestock$`));
	await expect(page.getByText('Show past livestock (2)')).toBeVisible();

	// a plant renamed on its sheet, and History says so
	await open(page, `${base}/plants`);
	await page.getByRole('button', { name: 'Add plant' }).first().click();
	await page.locator('#plant-name').fill('Java fern');
	await page.getByRole('dialog').getByRole('button', { name: 'Add plant' }).click();
	await expect(page.getByRole('status')).toContainText('Java fern');
	await page.getByRole('button', { name: /^Java fern/ }).click();
	await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Java fern Windelov');
	await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Plant saved');
	await expect(page.getByRole('button', { name: /^Java fern Windelov/ })).toBeVisible();
	await open(page, `/history?tank=${tankId}&range=all`);
	await expect(page.getByRole('link', { name: /Renamed Java fern to Java fern Windelov/ })).toBeVisible();
});
