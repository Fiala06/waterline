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

