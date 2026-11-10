import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #256: a dosing routine's schedule wraps under its name on a phone instead of widening the page
test('Tank setup fits a phone with a dosing routine', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'a phone layout');
	await page.setViewportSize({ width: 390, height: 844 });
	await newKeeperWithTank(page, 'setup-fits');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tasks/new?tank=${tankId}&type=dosing`);
	await page.getByLabel('Product').fill('Easy Green all-in-one fertilizer');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('added');

	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.getByRole('list', { name: 'Dosing routines' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
	// #259: Sharing is in the phone's setup links
	await expect(page.getByRole('navigation', { name: 'More setup' }).getByRole('link', { name: /^Sharing/ })).toHaveAttribute('href', `/tanks/${tankId}/sharing`);
});

// #259: Favorites is in the desktop Settings menu
test('Favorites is in the Settings menu', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'the desktop menu');
	await newKeeperWithTank(page, 'fav-menu');
	await open(page, '/settings');
	await page.getByRole('link', { name: 'Favorites', exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/favorites$/);
});

// #257: ⌘↵ / Ctrl+Enter saves the water test form, where Enter only moves on
test('Ctrl+Enter saves the water test', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'a keyboard shortcut');
	await newKeeperWithTank(page, 'ctrl-enter');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/entries/test/new?tank=${tankId}`);
	const first = page.locator('input[name^="v_"]').first();
	await first.fill('7.2');
	await first.press('Control+Enter');
	await expect(page.getByRole('status')).toContainText('Saved 1 reading');
});

// #255: a double click on Mark done marks it done once
test('a double click on Mark done records one completion', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'double-done');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tasks/new?tank=${tankId}&type=dosing`);
	await page.getByLabel('Product').fill('Thrive');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive added');

	await open(page, `/tasks?filter=${tankId}`);
	const posts: string[] = [];
	page.on('request', (r) => {
		if (r.method() === 'POST' && r.url().includes('/tasks?/done')) posts.push(r.url());
	});
	await page.getByRole('button', { name: 'Mark Dose Thrive done' }).dblclick();
	await expect(page.getByRole('status')).toContainText('Dose Thrive done');
	expect(posts).toHaveLength(1);

	const { default: Database } = await import('better-sqlite3');
	const db = new Database('.e2e-data/waterline.db', { readonly: true });
	const n = db
		.prepare('select count(*) as n from task_completions c join tasks t on t.id = c.task_id where t.tank_id = ?')
		.get(tankId) as { n: number };
	db.close();
	expect(n.n).toBe(1);
});

// #266: Charts opens on the range chosen last time, as History does
test('Charts remembers the range', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'chart-range');
	await open(page, '/charts?r=1y');
	await open(page, '/charts');
	await expect(page.getByRole('radio', { name: '1 year' }).first()).toBeChecked();
});
