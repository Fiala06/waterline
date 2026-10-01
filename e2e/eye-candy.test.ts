import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { newKeeperWithTank, open } from './helpers';

// A bit of fun: winks in empty states, a 404 whose fish swam off, a zero
// streak and milestones on the dashboard (only while nothing needs
// attention), and a splash on Mark done.

test('winks, the fish that swam off, streaks, milestones and the Mark done splash', async ({ page }, info) => {
	await newKeeperWithTank(page, `fun-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// empty states with a wink
	await open(page, `/tanks/${tankId}/livestock`);
	await expect(page.getByText('Just you and the bacteria.', { exact: false })).toBeVisible();
	await open(page, `/tanks/${tankId}/spending`);
	await expect(page.getByText('Your wallet says thanks… for now.', { exact: false })).toBeVisible();

	// a page that isn't there
	await page.goto('/tanks/no-such-tank-here');
	await expect(page.getByRole('heading', { name: 'This page swam off.' })).toBeVisible();
	await expect(page.locator('.tank .fish')).toBeAttached();

	// three tests with ammonia and nitrite at 0: the bacteria are clocking in
	for (let i = 0; i < 3; i++) {
		await open(page, `/entries/test/new?tank=${tankId}`);
		await page.getByLabel('Ammonia', { exact: true }).fill('0');
		await page.getByLabel('Nitrite', { exact: true }).fill('0');
		await page.getByRole('button', { name: /^Save 2 readings/ }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
	}
	await open(page, `/?tank=${tankId}`);
	const streak = page.getByText('Ammonia and nitrite at 0 for 3 tests. The bacteria are clocking in.');
	await expect(streak).toBeVisible();
	// the trend line draws itself in
	await expect(page.locator('polyline.trace').first()).toBeAttached();

	// day 100 of the tank
	const today = new Date().toISOString().slice(0, 10);
	const start = new Date(Date.parse(today) - 99 * 86_400_000).toISOString().slice(0, 10);
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update tanks set start_date = ? where id = ?').run(start, tankId);
	db.close();
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByRole('list', { name: 'Milestones' })).toContainText('Riverbed 40 turns 100 days 🎉');

	// but not while something is out of range
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Ammonia', { exact: true }).fill('1');
	await page.getByRole('button', { name: /^Save 1 reading/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByRole('list', { name: 'Milestones' })).toHaveCount(0);
	await expect(page.getByText('The bacteria are clocking in.')).toHaveCount(0);

	// Mark done: a check and a splash where the button was (not when it opens the water change form)
	const db2 = new Database('.e2e-data/waterline.db');
	db2.prepare('update tasks set open_form_on_done = 0 where tank_id = ?').run(tankId);
	db2.close();
	await open(page, '/tasks');
	await page.getByRole('button', { name: /Mark .* done|^Mark done$/ }).first().click();
	await expect(page.locator('.splash')).toBeAttached();
	await expect(page.getByRole('status')).toContainText('done');
});
