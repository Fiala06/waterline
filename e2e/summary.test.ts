import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newKeeperWithTank, open } from './helpers';

test('summary for an AI assistant', async ({ page, context }, info) => {
	const email = await newKeeperWithTank(page, `summary-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// Something to summarize: a test, a water change and some fish
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByLabel('Note').fill('Cloudy | green tint');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').pressSequentially('harlequin', { delay: 20 });
	await page.getByRole('option', { name: /Harlequin rasbora/i }).first().click();
	await page.getByLabel('Count', { exact: true }).fill('8');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 8 Harlequin rasbora');

	// and something planned
	await open(page, `/tanks/${tankId}/wishlist`);
	await page.locator('#wish-name').fill('Otocinclus');
	await page.locator('.count-stepper').getByRole('button', { name: 'More' }).click();
	await page.getByLabel('Price · optional').fill('18');
	await page.getByRole('button', { name: 'Add to wish list' }).click();
	await expect(page.getByRole('status')).toContainText('on the wish list');

	// light and CO₂ times on Setup (#76)
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('Lights on', { exact: true }).fill('10:00');
	await page.getByLabel('Lights off', { exact: true }).fill('18:00');
	await page.getByLabel('CO₂ on', { exact: true }).fill('09:00');
	await page.getByLabel('CO₂ off', { exact: true }).fill('17:00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');

	// From the tank's Overview
	await open(page, `/tanks/${tankId}`);
	await page.getByRole('link', { name: /Copy a summary of this tank/ }).click();
	await expect(page).toHaveURL(`/tanks/${tankId}/summary`);
	const pre = page.getByLabel('The summary');
	const text = (await pre.textContent())!;
	expect(text).toContain('# Riverbed 40: aquarium summary from Waterline');
	expect(text).toContain('- Lights: 10:00–18:00 (8 h a day)');
	expect(text).toContain('- CO₂: 09:00–17:00 (8 h a day)');
	expect(text).toContain('covering the last 90 days. Units: °F, gal (US), in');
	expect(text).toMatch(/\| Nitrate \| 5–20 ppm \| 40 ppm on \d{4}-\d{2}-\d{2} \| High, above target \| 40 \|/);
	expect(text).toContain('| Cloudy \\| green tint |'); // a note can't break the table
	expect(text).toMatch(/· Water change · 25% · Tap/);
	expect(text).toContain('- 8 × Harlequin rasbora (Trigonostigma heteromorpha), fish');
	expect(text).toMatch(/- Water change 25%: every 7 days, next due \d{4}-\d{2}-\d{2}/);
	expect(text).toContain('## Planned to add (wish list, 1)');
	expect(text).toContain('- 2 × Otocinclus, fish, about $18.00');
	expect(text).not.toContain(email); // no account details

	// Copy puts exactly that text on the clipboard
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'Copy summary' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Copied');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

	// Download: the same text as a Markdown file
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
	expect(download.suggestedFilename()).toMatch(/^waterline-riverbed-40-\d{4}-\d{2}-\d{2}\.md$/);
	expect(readFileSync(await download.path(), 'utf8')).toBe(text);

	// Another period
	await page.getByRole('link', { name: '30 days' }).click();
	await expect(page).toHaveURL(/days=30/);
	await expect(pre).toContainText('covering the last 30 days');
});

test('summary works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `summary-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}/summary`);
	await expect(plain.getByLabel('The summary')).toContainText('# Riverbed 40: aquarium summary from Waterline');
	// copying needs scripts, so it's not offered; the text can be selected or downloaded
	await expect(plain.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
	await expect(plain.getByRole('link', { name: 'Download' })).toHaveAttribute('href', `/tanks/${tankId}/summary.md?days=90`);
	await ctx.close();
});
