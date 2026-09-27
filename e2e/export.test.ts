import { expect, test } from '@playwright/test';
import { jpeg, newKeeperWithTank, open } from './helpers';

test('export a full backup and a CSV', async ({ page }, info) => {
	await newKeeperWithTank(page, `export-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('6.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('12');
	await page.getByLabel('Note').fill('before water change, "big" one');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
	// an expense with a receipt
	await open(page, `/tanks/${tankId}/spending/new`);
	await page.getByLabel('Amount').fill('19.99');
	await page.getByLabel('What for').fill('Test kit');
	await page.locator('input[name=receipt]').setInputFiles({ name: 'r.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
	await page.getByRole('button', { name: 'Add expense' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Expense added');

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
	expect(names).toMatch(/receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf/);

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
