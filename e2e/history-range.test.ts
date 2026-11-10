import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// History opens on the last 30 days. What's older is never hidden without saying so,
// and the range picked is kept for next time.

test('older entries are pointed out, and the range chosen is remembered', async ({ page }) => {
	await newKeeperWithTank(page, 'hist-range');
	const tankId = (await page.content()).match(/\/tanks\/([0-9a-f-]{36})/)![1];

	// an observation from 40 days ago
	const day = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/entries/event/new?tank=${tankId}&category=observation&date=${day}&time=09:00`);
	await page.locator('#note').fill('Planted the carpet');
	await page.locator('button.save').click();
	await expect(page.getByRole('status')).toBeVisible();

	// the last 30 days: the old note isn't in the list, but it's counted, with the way to it
	await open(page, '/history');
	await expect(page.getByRole('link', { name: '1 older' })).toBeVisible();
	await expect(page.getByText(/^1 older entry before /)).toBeVisible();
	await expect(page.getByText('Planted the carpet')).toHaveCount(0);

	// a range with nothing in it says the range is empty, not the tank's history
	await open(page, '/history?cat=observation&range=7');
	await expect(page.getByRole('heading', { name: 'Nothing in the last 7 days' }).filter({ visible: true })).toBeVisible();

	await open(page, '/history?range=30');
	await page.getByRole('link', { name: 'Show all time' }).first().click();
	await expect(page).toHaveURL(/range=all/);
	await expect(page.getByText('Planted the carpet').first()).toBeVisible();

	// next time, History opens on All time
	await open(page, '/history');
	await expect(page.getByLabel('Date range')).toHaveValue('all');
	await expect(page.getByText('Planted the carpet').first()).toBeVisible();
	await expect(page.getByRole('link', { name: /older$/ })).toHaveCount(0);
});


// #240: a long History comes a page at a time, and "Show older" goes on from where the page ended.
test('a long history is shown a hundred entries at a time', async ({ page }) => {
	await newKeeperWithTank(page, 'hist-pages');
	const tankId = (await page.content()).match(/\/tanks\/([0-9a-f-]{36})/)![1];
	// 130 feedings, one every hour up to an hour ago, straight into the database
	const { default: Database } = await import('better-sqlite3');
	const db = new Database('.e2e-data/waterline.db');
	const add = db.prepare("insert into events (id, tank_id, category, occurred_at, data) values (?, ?, 'feeding', ?, '{}')");
	const hourAgo = Date.now() - 3_600_000;
	for (let i = 0; i < 130; i++) add.run(crypto.randomUUID(), tankId, new Date(hourAgo - i * 3_600_000).toISOString());
	db.close();

	await open(page, '/history?cat=feeding&range=all');
	await expect(page.getByText('130 entries')).toBeVisible();
	await expect(page.locator('a.row')).toHaveCount(100);
	await expect(page.getByText('30 more entries')).toBeVisible();
	const firstPage = await page.locator('a.row').evaluateAll((rows) => rows.map((r) => r.getAttribute('href')));

	// the rest, and none of the first page again
	await page.getByRole('link', { name: 'Show older' }).click();
	await expect(page).toHaveURL(/before=/);
	await expect(page.locator('a.row')).toHaveCount(30);
	const second = await page.locator('a.row').evaluateAll((rows) => rows.map((r) => r.getAttribute('href')));
	expect(second.filter((h) => firstPage.includes(h))).toEqual([]);
	await expect(page.getByRole('link', { name: 'Show older' })).toHaveCount(0);
	// the count is still the whole range's
	await expect(page.getByText('130 entries')).toBeVisible();

	// back to the newest; another category starts from its own newest too
	await page.getByRole('link', { name: 'Show newest' }).click();
	await expect(page).not.toHaveURL(/before=/);
	await expect(page.locator('a.row')).toHaveCount(100);
});
