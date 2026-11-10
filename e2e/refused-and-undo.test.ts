import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #261: a sheet whose save is refused stays open with what was typed; #258: a plant's Remove can be undone
test('plants: a refused trim keeps its sheet, and Remove can be undone', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'plant-undo');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/plants`);
	await page.getByRole('button', { name: 'Add plant' }).first().click();
	await page.locator('#plant-name').fill('Java fern');
	await page.getByRole('dialog').getByRole('button', { name: 'Add plant' }).click();
	await expect(page.getByRole('status')).toContainText('Java fern');

	// a trim with no plant ticked is refused inside the sheet, the note kept
	await page.getByRole('button', { name: 'Trim', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Log trim' });
	await sheet.locator('label.chip', { hasText: 'Java fern' }).click();
	await expect(sheet.getByRole('checkbox', { name: 'Java fern' })).not.toBeChecked();
	await sheet.getByLabel('Note').fill('replanted tops');
	await sheet.getByRole('button', { name: 'Log trim' }).click();
	await expect(sheet.getByRole('alert')).toContainText('Choose the plants you trimmed.');
	await expect(sheet.getByLabel('Note')).toHaveValue('replanted tops');
	await page.keyboard.press('Escape');

	// Remove, then Undo from the toast
	await page.getByRole('button', { name: /^Java fern/ }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('status')).toContainText('Java fern removed');
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Java fern is back');
	await expect(page.getByRole('button', { name: /^Java fern/ })).toBeVisible();
	await open(page, `/history?tank=${tankId}&range=all`);
	await expect(page.getByRole('link', { name: /Planted Java fern/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Removed/ })).toHaveCount(0);
});

// #258: resetting every target asks first
test('Reset to defaults asks before overwriting the targets', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'targets-reset');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/targets`);
	await page.getByRole('button', { name: /^Reset to .* defaults$/ }).click();
	const ask = page.getByRole('alertdialog');
	await expect(ask).toContainText('Every target range goes back');
	await ask.getByRole('button', { name: 'Cancel' }).click();
	await expect(ask).toBeHidden();
	await page.getByRole('button', { name: /^Reset to .* defaults$/ }).click();
	await ask.getByRole('button', { name: 'Reset' }).click();
	await expect(page.getByRole('status')).toContainText('Targets reset to defaults');
});

// #261: without scripts, a refused equipment save comes back with what was typed
test('a refused equipment save keeps the form without scripts', async ({ page, browser }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'equip-nojs');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/equipment/new`);
	await plain.locator('textarea[name="notes"]').fill('Bought second hand');
	await plain.locator('form button.save').click();
	await expect(plain.getByText('Enter a brand or model.')).toBeVisible();
	await expect(plain.locator('textarea[name="notes"]')).toHaveValue('Bought second hand');
	await ctx.close();
});

// #267: the ⌘K palette tells a screen reader which row is highlighted
test('the palette is a combobox that follows the highlighted row', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'a keyboard shortcut');
	await newKeeperWithTank(page, 'palette-a11y');
	await page.keyboard.press('Control+k');
	const input = page.getByRole('combobox', { name: 'Search tanks or type an action' });
	await expect(input).toBeFocused();
	const first = await input.getAttribute('aria-activedescendant');
	expect(first).toBe('palette-option-0');
	await expect(page.locator(`#${first}`)).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('ArrowDown');
	await expect(input).toHaveAttribute('aria-activedescendant', 'palette-option-1');
});
