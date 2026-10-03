import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, pickDate } from './helpers';

test('water test: use last readings, with undo', async ({ page }, info) => {
	await newKeeperWithTank(page, `uselast-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const form = `/entries/test/new?tank=${tankId}`;
	const useLast = page.getByRole('link', { name: 'Use last readings' });

	// Nothing to copy before the first test
	await open(page, form);
	await expect(useLast).toHaveCount(0);
	await page.getByLabel('pH', { exact: true }).fill('7.2');
	await page.getByLabel('Nitrate', { exact: true }).fill('30');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');

	// Each empty field gets its last reading; what's typed stays
	await open(page, form);
	await page.getByLabel('pH', { exact: true }).fill('7.4');
	await useLast.click();
	await expect(page.getByText('✓ Filled 1 from last readings')).toBeVisible();
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('7.4');
	await expect(page.getByLabel('Nitrate', { exact: true })).toHaveValue('30');
	await expect(page.getByLabel('Ammonia', { exact: true })).toHaveValue('');
	await expect(page).toHaveURL(form);

	// Undo empties only the copied values nobody changed
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByLabel('Nitrate', { exact: true })).toHaveValue('');
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('7.4');
	await useLast.click();
	await page.getByLabel('Nitrate', { exact: true }).fill('25');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings · 1 out of range');
});

test('water test: also log a water change', async ({ page }, info) => {
	await newKeeperWithTank(page, `testwc-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const form = `/entries/test/new?tank=${tankId}`;

	// An overdue water change task, so the card offers to complete it
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, href!);
	await pickDate(page, 'nextDue', new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	await open(page, form);
	const wc = page.getByRole('checkbox', { name: /Also log a water change/ });
	const amount = page.getByLabel('Amount', { exact: true });
	await expect(wc).not.toBeChecked();
	await expect(page.getByText('25% · Tap')).toBeVisible();
	await expect(amount).toBeHidden();
	await page.getByLabel('Nitrate', { exact: true }).fill('30');
	await wc.check();
	await expect(amount).toHaveValue('25');
	await page.getByRole('button', { name: '50%' }).click();
	await page.locator('label', { hasText: 'RODI' }).click();
	await expect(page.getByLabel(/Also complete task “Water change 25%”/)).toBeChecked();
	await page.getByRole('button', { name: 'Save 1 reading + water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading + water change · 1 out of range');

	// Two entries, and the task moved on
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Water change · 50% · RODI')).toBeVisible();
	await expect(page.getByRole('link', { name: /^Water test · 1 reading/ })).toBeVisible();
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: /Overdue/ })).toHaveCount(0);

	// Next time the card starts on, as last time
	await open(page, form);
	await expect(wc).toBeChecked();
	await expect(amount).toHaveValue('50');
	await expect(page.getByRole('radio', { name: 'RODI' })).toBeChecked();

	// A bad amount keeps what was entered and says what's wrong
	await page.getByLabel('Nitrate', { exact: true }).fill('12');
	await amount.fill('150');
	await page.getByRole('button', { name: 'Save 1 reading + water change' }).click();
	await expect(page.getByText('✕ Enter a percentage up to 100.')).toBeVisible();
	await expect(page.getByLabel('Nitrate', { exact: true })).toHaveValue('12');
	await expect(wc).toBeChecked();
});

test('water test extras work without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `testwc-plain-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/entries/test/new?tank=${tankId}`);
	await expect(plain.getByLabel('Amount', { exact: true })).toBeHidden();
	await plain.getByRole('checkbox', { name: /Also log a water change/ }).check();
	await expect(plain.getByLabel('Amount', { exact: true })).toBeVisible();
	await plain.getByLabel('Nitrate', { exact: true }).fill('10');
	await plain.getByRole('button', { name: 'Save' }).click();
	await expect(plain.getByText('Water change · 25% · Tap')).toBeVisible();

	// "Use last readings" asks the server for the form filled in
	await plain.goto(`/entries/test/new?tank=${tankId}`);
	await plain.getByRole('link', { name: 'Use last readings' }).click();
	await expect(plain.getByLabel('Nitrate', { exact: true })).toHaveValue('10');
	await ctx.close();
});

test('water test: Edit targets and parameters, then back to the test', async ({ page }, info) => {
	await newKeeperWithTank(page, `targets-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const form = `/entries/test/new?tank=${tankId}`;
	await open(page, form);
	await page.getByLabel('pH', { exact: true }).fill('7.2');

	await page.getByRole('link', { name: 'Edit targets and parameters ›' }).click();
	await expect(page).toHaveURL(new RegExp(`/tanks/${tankId}/targets\\?from=`));
	await page.getByLabel('pH maximum').fill('7.8');
	await page.getByRole('button', { name: 'Save targets' }).click();

	// back on the water test, with what was typed
	await expect(page).toHaveURL(form);
	await expect(page.getByLabel('pH', { exact: true })).toHaveValue('7.2');
	await open(page, `/tanks/${tankId}/targets`);
	await expect(page.getByLabel('pH maximum')).toHaveValue('7.8');
});

test('water test: Copy puts the readings on the clipboard as plain text', async ({ page, context }, info) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await newKeeperWithTank(page, `copy-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('7.8');
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('Saved 2 readings');

	// the test's own page
	await open(page, '/history');
	const href = await page.locator('a.row', { hasText: 'Water test · 2 readings' }).first().getAttribute('href');
	await open(page, href!);
	await page.getByRole('button', { name: 'Copy readings as text' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Readings copied');
	const text = await page.evaluate(() => navigator.clipboard.readText());
	const lines = text.split('\n');
	expect(lines[0]).toMatch(/^Riverbed 40 · water test · \w{3} \d+, \d{4}, \d+:\d{2} [AP]M$/);
	expect(lines.slice(1)).toEqual(['pH 7.8', 'Nitrate 40 ppm']);
	expect(text).not.toMatch(/High|range|✕|✓/);
});
