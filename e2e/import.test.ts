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

test('import water tests into History, and undo the whole import from the toast', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-history-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');

	// From History: the import for the category picked
	await open(page, `/history?tank=${tankId}&cat=test&range=all`);
	await page.getByRole('link', { name: 'Import from a spreadsheet' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/tests`);

	// The template has a column per parameter, in the keeper's units
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download template' }).click()]);
	expect(download.suggestedFilename()).toBe('waterline-tests.csv');
	const header = readFileSync(await download.path(), 'utf8').split('\r\n')[0];
	expect(header).toMatch(/^﻿Date,Time,pH,Ammonia \(ppm\),/);
	expect(header).toContain('Temperature (°F)');

	// Columns in any order, a unit named in a column, another tank's row and one to fix
	await file.setInputFiles(
		csv(
			'my-tests.csv',
			'Date,Time,Tank,pH,Nitrate (ppm),Temperature (°C),Note\n9/1/2026,8:30 AM,Riverbed 40,6.8,10,25,Before the move\n9/8/2026,,Riverbed 40,7.0,15,,\n9/9/2026,,Riverbed 40,high,,,\n9/10/2026,,Reef 24,8.2,,,\n'
		)
	);
	await expect(page.getByText('my-tests.csv · 4 rows')).toBeVisible();
	await expect(page.getByText('✓ 2 to add')).toBeVisible();
	await expect(page.getByText('✕ 1 to fix')).toBeVisible();
	await expect(page.getByText('– 1 from other tanks left out')).toBeVisible();
	await expect(page.getByText("pH “high” isn't a number")).toBeVisible();
	await expect(page.getByText('pH 6.8 · Nitrate 10 ppm · Temperature 77 °F')).toBeVisible();
	await page.getByRole('button', { name: 'Add 2 water tests' }).click();

	// Each row is a History entry at its own date and time
	await expect(page.getByRole('status')).toContainText('✓ Imported 2 water tests');
	await expect(page).toHaveURL(`/history?tank=${tankId}&cat=test&range=all`);
	await expect(page.getByText('Water test · 3 readings')).toBeVisible();
	await expect(page.getByText('8:30 AM · Before the move')).toBeVisible();

	// One step takes it all back
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Import undone · 2 water tests removed');
	await expect(page.getByText('Water test · 3 readings')).toHaveCount(0);
	await expect(page.getByText('Nothing logged here yet')).toBeVisible();
});

test('import water changes and doses; the export reads back as it is', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-kinds-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');

	// A percentage or a volume: the other comes from the tank's 40 gal
	await open(page, `/tanks/${tankId}/import/water-changes`);
	await file.setInputFiles(csv('changes.csv', 'Date,Amount (%),Volume (gal),Source\n2026-09-01,25,,Tap\n2026-09-08,,10,RO/DI\n'));
	await page.getByRole('button', { name: 'Add 2 water changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 2 water changes');
	await expect(page.getByRole('link', { name: /^Water change · 25% · Tap/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /^Water change · 25% · RODI/ })).toBeVisible();

	// The kinds are a chip apart; a unit can follow the amount
	await open(page, `/tanks/${tankId}/import/water-changes`);
	await page.getByRole('link', { name: 'Dosing', exact: true }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/dosing`);
	await file.setInputFiles(csv('doses.csv', 'Date,Product,Amount\n2026-09-02,Seachem Prime,5 mL\n'));
	await page.getByRole('button', { name: 'Add 1 dose' }).click();
	await expect(page.getByRole('link', { name: /^Dosed Seachem Prime · 5 mL/ })).toBeVisible();

	// A water test logged here, exported, reads back as the same entry
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('12');
	await page.getByLabel('Note').fill('before water change, "big" one');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
	await open(page, '/settings/export');
	await page.locator('label', { hasText: 'Water tests (CSV)' }).click();
	await page.getByRole('button', { name: 'Build CSV' }).click();
	await expect(page.getByText('✓ CSV ready')).toBeVisible({ timeout: 15_000 });
	const exported = await (await page.request.get((await page.getByRole('link', { name: 'Download' }).first().getAttribute('href'))!)).text();

	await open(page, `/tanks/${tankId}/import/tests`);
	await file.setInputFiles(csv('water-tests.csv', exported));
	await expect(page.getByText('▲ 1 already in History')).toBeVisible();
	await expect(page.getByText('Already in History; tick it to add it again')).toBeVisible();
	await expect(page.getByText('pH 6.8 · Nitrate 12 ppm')).toBeVisible();
	await expect(page.getByText('before water change, "big" one')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Tick rows to add' })).toBeDisabled();
});

test('any import can be undone later, animals added to a group come off its count', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-undo-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');
	const importFish = async (count: number, total: string) => {
		await open(page, `/tanks/${tankId}/import/livestock`);
		await file.setInputFiles(csv('fish.csv', `Name,Count\nNeon tetra,${count}\n`));
		if (total !== `${count} animals · 1 species`) await page.getByRole('checkbox', { name: /Neon tetra/ }).check();
		await page.getByRole('button', { name: `Add ${count} animals` }).click();
		await expect(page.getByText(total, { exact: true })).toBeVisible();
	};
	await importFish(10, '10 animals · 1 species');
	await importFish(5, '15 animals · 1 species');

	// The second import, from Recent imports: the group keeps the first import's 10
	await open(page, `/tanks/${tankId}/import/livestock`);
	await expect(page.getByRole('heading', { name: 'Recent imports' })).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'Undo this import?' })).toBeVisible();
	await page.getByRole('button', { name: 'Undo import' }).click();
	await expect(page.getByRole('status')).toContainText('Import undone · 5 animals · 1 species removed');
	await expect(page.getByText('Undone', { exact: true })).toBeVisible();
	await open(page, `/tanks/${tankId}/livestock`);
	await expect(page.getByText('10 animals · 1 species', { exact: true })).toBeVisible();

	// The first: the group it made goes, and so do its History entries
	await open(page, `/tanks/${tankId}/import/livestock`);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await page.getByRole('button', { name: 'Undo import' }).click();
	await expect(page.getByRole('status')).toContainText('Import undone · 10 animals · 1 species removed');
	await open(page, `/history?tank=${tankId}&cat=livestock&range=all`);
	await expect(page.getByText('+10 Neon tetra')).toHaveCount(0);
	await expect(page.getByText('+5 Neon tetra')).toHaveCount(0);
});

test('History import works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `import-history-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/import/notes`);
	await plain.locator('input[type=file][name=file]').setInputFiles(csv('notes.csv', 'Date,Note\n2026-09-01,"Moved the tank, and the stand"\n'));
	await plain.getByRole('button', { name: 'Check the file' }).click();
	await plain.getByRole('button', { name: 'Add 1 note' }).click();
	await expect(plain).toHaveURL(`/history?tank=${tankId}&cat=note&range=all`);
	await expect(plain.getByText('Moved the tank, and the stand').first()).toBeVisible();
	await ctx.close();
});

test('imports are found from History, Quick add, Import & export and an empty dashboard', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-ways-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// an empty dashboard offers past tests
	await expect(page.getByRole('link', { name: 'Import past tests' })).toHaveAttribute('href', `/tanks/${tankId}/import/tests`);

	// Quick add
	await page.getByRole('button', { name: 'Quick add' }).first().click();
	await page.getByRole('dialog').getByRole('link', { name: 'Import a spreadsheet' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/tests`);

	// Settings › Import & export: the kind, for the tank
	await open(page, '/settings/export');
	await expect(page.getByRole('heading', { name: 'Import & export' })).toBeVisible();
	await page.getByRole('button', { name: 'Water changes' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/water-changes`);
	await open(page, '/settings/export');
	await page.getByRole('button', { name: 'Plants' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/plants`);
});

test('columns with other names can be picked by hand', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-columns-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.locator('input[type=file][name=file]').setInputFiles(csv('tagebuch.csv', 'Tag,Nitrat,Bemerkung\n2026-09-20,15,Nach dem Wechsel\n'));

	// no Date column by name: the file's columns, to pick from
	await expect(page.getByRole('alert')).toContainText("There's no Date column. Choose which of your columns it is below");
	await page.getByLabel('Tag').selectOption({ label: 'Date' });
	await expect(page.getByRole('alert')).toContainText("None of the columns is one of this tank's parameters");
	await page.getByLabel('Nitrat').selectOption({ label: 'Nitrate (ppm)' });
	await expect(page.getByText('tagebuch.csv · 1 row')).toBeVisible();
	await expect(page.getByText('Nitrate 15 ppm')).toBeVisible();
	await expect(page.getByText('Columns not read: Bemerkung')).toBeVisible();
	await page.getByLabel('Bemerkung').selectOption({ label: 'Note' });
	await expect(page.getByText('Nach dem Wechsel')).toBeVisible();
	await expect(page.getByText('All 3 read')).toBeVisible();

	// the picks carry through to the import
	await page.getByRole('button', { name: 'Add 1 water test' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 1 water test');
	await expect(page.getByText('Nach dem Wechsel').first()).toBeVisible();
});

test('one file with several kinds of entry, undone in one step', async ({ page }, info) => {
	await newKeeperWithTank(page, `import-mixed-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/import/tests`);
	await page.getByRole('link', { name: 'Several kinds' }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/import/history`);
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download template' }).click()]);
	expect(readFileSync(await download.path(), 'utf8').split('\r\n')[0]).toMatch(/^﻿Date,Time,Type,pH,/);

	await page.locator('input[type=file][name=file]').setInputFiles(
		csv(
			'log.csv',
			'Date,Type,Nitrate (ppm),Amount,Product,Note\n2026-09-20,Water test,15,,,\n2026-09-20,Water change,,30%,,\n2026-09-21,Dose,,5,Water conditioner,\n2026-09-22,Note,,,,Fed frozen food\n2026-09-22,Party,,,,\n'
		)
	);
	await expect(page.getByText('✓ 4 to add')).toBeVisible();
	await expect(page.getByText('Water change · 30%')).toBeVisible();
	await expect(page.getByText('Dosing · Water conditioner · 5 mL')).toBeVisible();
	await expect(page.getByText("Type “Party” isn't Water test, Water change, Dosing, Maintenance, Observation or Note")).toBeVisible();
	await page.getByRole('button', { name: 'Add 4 entries' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 4 entries');
	await expect(page).toHaveURL(`/history?tank=${tankId}&range=all`);
	await expect(page.getByText('Fed frozen food').first()).toBeVisible();

	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Import undone · 4 entries removed');
	await expect(page.getByText('Fed frozen food')).toHaveCount(0);
});

test('columns can be picked without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `import-columns-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/import/notes`);
	await plain.locator('input[type=file][name=file]').setInputFiles(csv('notes.csv', 'Wann,Notiz\n2026-09-20,Moved the tank\n'));
	await plain.getByRole('button', { name: 'Check the file' }).click();
	await expect(plain.getByRole('alert')).toContainText("There's no Date column");
	await plain.getByLabel('Wann').selectOption({ label: 'Date' });
	await plain.getByLabel('Notiz').selectOption({ label: 'Note' });
	await plain.getByRole('button', { name: 'Check again' }).click();
	await expect(plain.getByText('notes.csv · 1 row')).toBeVisible();
	await plain.getByRole('button', { name: 'Add 1 note' }).click();
	await expect(plain.getByText('Moved the tank').first()).toBeVisible();
	await ctx.close();
});
