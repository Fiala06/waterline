import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { newKeeperWithTank, open } from './helpers';

const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

test("the admin sees what went wrong, finds an error page's reference, and downloads the log", async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `logs-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const file = page.locator('input[type=file][name=file]');
	const bad = `no-dates-${info.project.name}.csv`;

	// a file that can't be read: a warning
	await open(page, `/tanks/${tankId}/import/notes`);
	await file.setInputFiles(csv(bad, 'Something,Note\nMonday,Hello\n'));
	await expect(page.getByRole('alert')).toContainText('no Date column');

	// a page that fails: an error, with a reference on the error page
	await page.goto('/dev/fail');
	await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
	const ref = (await page.locator('.ref .mono').textContent())!.trim();
	expect(ref).toMatch(/^[0-9a-f]{8}$/);

	// an admin, from here on
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update users set is_admin = 1 where email = ?').run(email);
	db.close();
	await open(page, '/settings/server');
	await expect(page.getByRole('link', { name: /^Logs \d|^Logs Nothing/ })).toContainText(/error|warning/);
	await page.getByRole('link', { name: /^Logs \d|^Logs Nothing/ }).click();
	await expect(page).toHaveURL('/settings/server/logs');

	// by level
	await page.getByRole('link', { name: /^Warnings · \d+$/ }).click();
	await expect(page.getByText(`Couldn't read ${bad}: There's no Date column.`, { exact: false }).first()).toBeVisible();
	await page.getByRole('link', { name: /^Errors · \d+$/ }).click();
	await expect(page.getByText('GET /dev/fail failed').first()).toBeVisible();

	// by the error page's reference: that one entry, with what went wrong and for whom
	await page.getByLabel('Reference from an error page').fill(ref);
	await page.getByRole('button', { name: 'Find' }).click();
	const entry = page.locator('li.entry');
	await expect(entry).toHaveCount(1);
	await expect(entry).toContainText('✕ Error');
	await expect(entry).toContainText(email);
	await entry.getByText('Details').click();
	await expect(entry.locator('pre')).toContainText('A failure on purpose, for the tests');

	// the download: every entry, with the account's address kept out
	const download = await page.request.get('/settings/server/logs/download');
	expect(download.headers()['content-disposition']).toMatch(/waterline-log-\d{4}-\d{2}-\d{2}\.txt/);
	const text = await download.text();
	expect(text).toContain(`ref ${ref}`);
	expect(text).toContain(`Couldn't read ${bad}`);
	expect(text).not.toContain(email);

	// more detail on demand: what the server does, like an import
	await open(page, '/settings/server/logs');
	await page.getByLabel('What the server does too').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved');
	await open(page, `/tanks/${tankId}/import/notes`);
	await file.setInputFiles(csv(`ok-${info.project.name}.csv`, 'Date,Note\n2026-09-01,Hello\n'));
	await page.getByRole('button', { name: 'Add 1 note' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Imported 1 note');
	await open(page, '/settings/server/logs?level=info');
	await expect(page.getByText(`Imported 1 note from ok-${info.project.name}.csv`)).toBeVisible();
	// and back to errors and warnings
	await page.getByLabel('Errors and warnings').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved');
});
