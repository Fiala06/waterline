import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('export a full backup and a CSV', async ({ page }, info) => {
	await newKeeperWithTank(page, `export-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/log/test?tank=${tankId}`);
	await page.getByLabel(/^pH /).fill('6.8');
	await page.getByLabel(/^Nitrate /).fill('12');
	await page.getByLabel('Note').fill('before water change, "big" one');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');

	// Full backup
	await open(page, '/settings/export');
	await expect(page.getByText(/ZIP with JSON data and all photos · about/)).toBeVisible();
	await page.getByRole('button', { name: 'Build backup' }).click();
	await expect(page.getByText('✓ Backup ready')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText(/1 photo, 2 entries/)).toBeVisible();
	const zipHref = await page.getByRole('link', { name: 'Download' }).first().getAttribute('href');
	const zip = await page.request.get(zipHref!);
	expect(zip.headers()['content-type']).toBe('application/zip');
	expect(zip.headers()['content-disposition']).toMatch(/waterline-backup-riverbed-40-\d{4}-\d{2}-\d{2}\.zip/);
	const bytes = await zip.body();
	expect(bytes.subarray(0, 2).toString()).toBe('PK');
	const names = bytes.toString('latin1');
	expect(names).toContain('waterline.json');
	expect(names).toContain('water-tests.csv');
	expect(names).toMatch(/photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg/);

	// CSV of water tests
	await page.locator('label', { hasText: 'Water tests (CSV)' }).click();
	await page.getByRole('button', { name: 'Build CSV' }).click();
	await expect(page.getByText('✓ CSV ready')).toBeVisible({ timeout: 15_000 });
	const csvHref = await page.getByRole('link', { name: 'Download' }).first().getAttribute('href');
	const csv = await (await page.request.get(csvHref!)).text();
	const [header, row] = csv.trim().split('\n');
	expect(header).toContain('Date,Time,Tank,pH,Ammonia (ppm)');
	expect(header).toContain('Temperature (°F)');
	expect(row).toContain('Riverbed 40,6.8');
	expect(row).toContain(',12,');
	expect(row).toContain('"before water change, ""big"" one"');

	// Older export listed; nobody else can download it
	await expect(page.getByRole('heading', { name: 'Recent exports' })).toBeVisible();
	const other = await page.context().browser()!.newContext();
	const res = await other.request.get(new URL(csvHref!, page.url()).toString(), { maxRedirects: 0 });
	expect([303, 302, 404]).toContain(res.status());
	await other.close();
});
