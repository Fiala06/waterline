import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newKeeperWithTank, open } from './helpers';

const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

test('import livestock from a spreadsheet', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');

	await open(page, `/tanks/${tankId}/livestock`);
	await page.getByRole('link', { name: 'Import a list from a spreadsheet' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/livestock`);

	// The template: the columns Waterline reads, and two examples
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download template' }).click()]);
	expect(download.suggestedFilename()).toBe('waterline-livestock.csv');
	const template = readFileSync(await download.path(), 'utf8');
	expect(template.split('\r\n')[0]).toBe('\uFEFFName,Scientific name,Type,Count,Added,Status,Source');

	// Filled in, with the examples left as they were and two rows to fix
	const filled = template + 'Otocinclus,,,5,9/20/2026,,\r\nCherry shrimp,,Invert,a few,,,\r\nMystery snail,,,2,,,Pet store\r\nJava fern,,,,,,\r\n';
	await file.setInputFiles(csv('my-stock.csv', filled));
	await expect(page.getByText('my-stock.csv · 6 rows')).toBeVisible();
	await expect(page.getByText('✓ 2 to add')).toBeVisible();
	await expect(page.getByText('✕ 2 to fix')).toBeVisible();
	await expect(page.getByText('– 2 examples left out')).toBeVisible();
	await expect(page.getByText("Count “a few” isn't a whole number")).toBeVisible();
	await expect(page.getByText('Java fern is a plant: import it on the Plants tab')).toBeVisible();
	await expect(page.getByText('Otocinclus vittatus')).toBeVisible();
	await page.getByRole('button', { name: 'Add 7 animals' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 7 animals · 2 species');
	await expect(page.getByText('7 animals · 2 species', { exact: true })).toBeVisible();

	// The same file again: what the tank has waits for a tick
	await page.getByRole('link', { name: 'Import from a spreadsheet' }).click();
	await file.setInputFiles(csv('my-stock.csv', filled));
	await expect(page.getByText('▲ 2 already in the tank')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Tick rows to add' })).toBeDisabled();
	await page.getByRole('checkbox', { name: /Mystery snail/ }).check();
	await page.getByRole('button', { name: 'Add 2 animals' }).click();
	await expect(page.getByText('9 animals · 2 species', { exact: true })).toBeVisible();

	// Each row is a History entry, on its Added date
	await open(page, `/history?tank=${tankId}&range=all`);
	await expect(page.getByText('+5 Otocinclus')).toBeVisible();
	await expect(page.getByText('Sun Sep 20', { exact: false })).toBeVisible();
});

test('import plants and equipment, with its reminders', async ({ page }, info) => {
	await newKeeperWithTank(page, `import2-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');

	await open(page, `/tanks/${tankId}/import/plants`);
	await file.setInputFiles(csv('plants.csv', 'Name,Position\nJava fern,Epiphyte\nMonte Carlo,Carpet\nNeon tetra,\n'));
	await expect(page.getByText('Neon tetra is an animal: import it on the Livestock tab')).toBeVisible();
	await page.getByRole('button', { name: 'Add 2 plants' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 2 plants');
	await expect(page.getByRole('button', { name: /^Monte Carlo/ })).toBeVisible();

	await open(page, `/tanks/${tankId}/import/equipment`);
	await file.setInputFiles(csv('gear.csv', 'Type,Brand,Model,Filter type,Flow rate (gph)\nFilter,Tidewell,C-400,Canister,300\nPowerhead,Tidewell,Wave 2,,\n'));
	await expect(page.getByText('Also add the suggested maintenance reminders (1)')).toBeVisible();
	await page.getByRole('button', { name: 'Add 2 items' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 2 items · 1 reminder added');
	await expect(page.getByText('300 gph')).toBeVisible();
	await open(page, '/tasks');
	await expect(page.getByText('Clean Tidewell C-400 canister').first()).toBeVisible();
});

test('import works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `import-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/import/plants`);
	await plain.locator('input[type=file][name=file]').setInputFiles(csv('plants.csv', 'Name\nAnubias nana\n'));
	await plain.getByRole('button', { name: 'Check the file' }).click();
	await plain.getByRole('button', { name: 'Add 1 plant' }).click();
	// toasts need scripts; the plant is on the Plants tab
	await expect(plain).toHaveURL(`/tanks/${tankId}/plants`);
	await expect(plain.getByRole('button', { name: /^Anubias nana/ })).toBeVisible();
	await ctx.close();
});
