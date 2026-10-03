import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { newKeeperWithTank, open } from './helpers';

// #20: care ranges from a (stand-in) FishBase snapshot, and what's worth checking on Livestock, when adding, on the animal's page and in the summary.
test('species care: download, ranges and warnings', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `care-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// an admin downloads the care data (the test server reads a tiny snapshot from e2e/files/fishbase)
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update users set is_admin = 1 where email = ?').run(email);
	db.close();
	await open(page, '/settings/server');
	const careRow = page.locator('form[action="?/careDownload"]');
	await expect(careRow).toContainText('Data © FishBase, CC BY-NC 4.0');
	await careRow.getByRole('button', { name: /Download (now|again)/ }).click();
	await expect(careRow.getByRole('status')).toContainText('care ranges for 4 of the bundled fish');
	await expect(careRow).toContainText('4 of the bundled fish');

	// Adding livestock: the species' ranges appear as it's picked, with a group warning for three tetras
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').fill('neon tet');
	await page.getByRole('option', { name: /Neon tetra/ }).click();
	const care = page.locator('.care');
	// a new keeper's units are US
	await expect(care).toContainText('Neon tetra · 68–79 °F · pH 5–7 · GH 1–2 dGH · up to 1 in · in a group');
	await expect(care).toContainText("▲ Your tank's GH target (4–8 dGH) is outside the Neon tetra's range (1–2 dGH)");
	await expect(care).toContainText('▲ Neon tetra do best in groups of 6 or more · you have 1');
	await expect(care).toContainText('Care ranges from FishBase · CC BY-NC 4.0');
	await page.locator('#count-in').fill('3');
	await expect(care).toContainText('you have 3');
	// the planted preset's temperature target (74–80 °F) suits them: no temperature warning
	await expect(care).not.toContainText('temperature target');
	await page.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 3 Neon tetra');

	// an angelfish: the tank's targets and the tetras are worth checking
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').fill('angelf');
	await page.getByRole('option', { name: /angelfish/i }).first().click();
	await expect(page.locator('.care')).toContainText('75–86 °F');
	await page.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 1');

	// Livestock: Worth checking, with the source
	await open(page, `/tanks/${tankId}/livestock`);
	const check = page.locator('section.check');
	await expect(check.getByRole('heading', { name: 'Worth checking' })).toBeVisible();
	await expect(check).toContainText('▲ Neon tetra do best in groups of 6 or more · you have 3');
	await expect(check).toContainText(/▲ .*angelfish.* · Neon tetra: Grown angelfish eat fish the size of Neon tetra\./i);
	await expect(check).toContainText('Care ranges from FishBase');

	// the animal's page: its ranges, credited
	await page.getByRole('link', { name: 'Neon tetra', exact: true }).click();
	const block = page.locator('section.care');
	await expect(block).toContainText('68–79 °F · pH 5–7 · GH 1–2 dGH · up to 1 in · in a group');
	await expect(block).toContainText('you have 3');
	await expect(block).toContainText('Ranges from FishBase');

	// the summary says the same, for a forum or an AI chat
	const md = await page.request.get(`/tanks/${tankId}/summary.md`);
	const text = await md.text();
	expect(text).toContain('## Species care');
	expect(text).toContain('- Neon tetra: 68–79 °F · pH 5–7 · GH 1–2 dGH · up to 1 in · in a group');
	expect(text).toContain('Neon tetra do best in groups of 6 or more · you have 3');
	expect(text).toContain('Care ranges from FishBase (https://www.fishbase.org), CC BY-NC 4.0.');

	// a tank whose targets don't suit: the temperature warning
	await open(page, `/tanks/${tankId}/targets`);
	await page.getByLabel('Temperature minimum').fill('82');
	await page.getByLabel('Temperature maximum').fill('88');
	await page.getByRole('button', { name: 'Save targets' }).click();
	await expect(page.getByRole('status')).toContainText(/Saved|saved/);
	await open(page, `/tanks/${tankId}/livestock`);
	await expect(page.locator('section.check')).toContainText("▲ Your tank's temperature target (82–88 °F) is outside the Neon tetra's range (68–79 °F)");

	// (the server-wide switch isn't toggled here: the desktop and phone runs share one server)
});
