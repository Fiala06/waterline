import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('equipment, livestock and plants', async ({ page }, info) => {
	await newKeeperWithTank(page, `specs-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// Equipment: filter with flow and a maintenance task
	await open(page, `${base}/equipment/new`);
	await page.getByLabel('Brand').fill('Tidewell');
	await page.getByLabel('Model').fill('C-400');
	await page.getByLabel('Filter type').selectOption('Canister');
	await page.getByLabel('Flow rate').fill('300');
	await expect(page.getByText('Create a maintenance task: clean every 4 weeks')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Tidewell C-400 canister added');
	await expect(page.getByText('300 gph')).toBeVisible();

	// Heater: fields change with the type
	await open(page, `${base}/equipment/new`);
	await page.locator('label', { hasText: /^Heater$/ }).click();
	await expect(page.getByLabel('Wattage')).toBeVisible();
	await page.getByLabel('Brand').fill('Tidewell');
	await page.getByLabel('Wattage').fill('200');
	await page.getByLabel('Set to').fill('77');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByText('Set 77 °F')).toBeVisible();

	// Livestock with the species list
	await open(page, `${base}/livestock/new`);
	await page.getByLabel('Species').pressSequentially('harlequin', { delay: 20 });
	await page.getByRole('option', { name: /Harlequin rasbora/i }).first().click();
	await expect(page.getByText('Trigonostigma heteromorpha')).toBeVisible();
	await page.getByLabel('Count', { exact: true }).fill('14');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 14 Harlequin rasbora');

	// Count down → log as loss
	await page.getByRole('button', { name: /One fewer Harlequin rasbora/ }).click();
	await expect(page.getByText('14 → 13. Log it as:')).toBeVisible();
	await page.getByRole('button', { name: 'Loss' }).click();
	await expect(page.getByRole('status')).toContainText('Harlequin rasbora 14 → 13');
	await expect(page.getByText('13 animals · 1 species')).toBeVisible();

	// Plants via Log event (linked), then trim
	await open(page, `/entries/event/new?tank=${tankId}&category=livestock`);
	await page.locator('label', { hasText: /^Plant$/ }).click();
	await page.getByLabel('Species').pressSequentially('Java fern', { delay: 20 });
	await page.getByRole('option', { name: /Use “Java fern” as a custom name|Java fern/ }).first().click();
	await page.getByRole('button', { name: 'Save change' }).click();
	await expect(page.getByRole('status')).toContainText('added to Plants');

	await open(page, `${base}/plants`);
	await expect(page.getByText('✓ Thriving')).toBeVisible();
	await page.getByRole('button', { name: 'Log trim' }).click();
	await page.locator('dialog[open] label', { hasText: /Java fern/i }).click();
	await page.getByRole('button', { name: 'Log trim' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Trim logged · 1 plant');
	await expect(page.getByText(/Trimmed/)).toBeVisible();

	// Overview summarises everything; history has the changes
	await open(page, base);
	await expect(page.getByText('Livestock · 13 in 1 species')).toBeVisible();
	await expect(page.getByText('Tidewell C-400 canister')).toBeVisible();
	await open(page, '/history');
	await expect(page.getByText('−1 Harlequin rasbora · loss')).toBeVisible();
	await expect(page.getByText('+14 Harlequin rasbora')).toBeVisible();
	await open(page, '/tasks');
	await expect(page.getByText('Clean Tidewell C-400 canister')).toBeVisible();
});
