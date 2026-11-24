import { expect, test } from './test';
import { newKeeperWithTank, open } from './helpers';

// #312: search a tank's History, with the category and dates of your choosing
test('search History, then narrow it to dates of your own', async ({ page }) => {
	await newKeeperWithTank(page, 'hist-search');
	const tankId = (await page.content()).match(/\/tanks\/([0-9a-f-]{36})/)![1];
	const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
	const note = async (text: string, date: string) => {
		await open(page, `/entries/event/new?tank=${tankId}&category=note&date=${date}&time=09:00`);
		await page.locator('#note').fill(text);
		await page.locator('button.save').click();
		await expect(page.getByRole('status')).toBeVisible();
	};
	await note('Swapped the filter média', daysAgo(40));
	await note('Fed the shrimp', daysAgo(1));

	// typed and Enter, on the last 30 days: nothing there, but it says one matches before them
	await open(page, '/history?range=30');
	const box = page.getByRole('searchbox', { name: 'Search History' });
	await box.fill('FILTER MEDIA');
	await box.press('Enter');
	await expect(page).toHaveURL(/q=FILTER\+MEDIA/);
	await expect(page.getByRole('heading', { name: 'Nothing matches “FILTER MEDIA”' }).filter({ visible: true })).toBeVisible();
	await page.getByRole('link', { name: 'Show all time' }).first().click();
	await expect(page).toHaveURL(/q=FILTER\+MEDIA/);
	await expect(page.locator('a.row', { hasText: 'Swapped the filter média' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: 'Fed the shrimp' })).toHaveCount(0);
	await expect(page.getByText(/^1 match/)).toBeVisible();

	// a link keeps the search; Clear search lets everything back
	await open(page, `/history?q=shrimp&range=all`);
	await expect(box).toHaveValue('shrimp');
	await expect(page.locator('a.row', { hasText: 'Fed the shrimp' })).toHaveCount(1);
	await page.getByRole('link', { name: 'Clear search' }).first().click();
	await expect(page).not.toHaveURL(/q=/);
	await expect(page.locator('a.row', { hasText: 'Fed the shrimp' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: 'Swapped the filter média' })).toHaveCount(1);

	// dates of your own: only what's between them
	await page.getByLabel('Date range').selectOption('custom');
	await page.getByLabel('From', { exact: true }).fill(daysAgo(41));
	await page.getByLabel('To', { exact: true }).fill(daysAgo(39));
	await page.getByRole('button', { name: 'Show' }).click();
	await expect(page).toHaveURL(/from=.*to=/);
	await expect(page.locator('a.row', { hasText: 'Swapped the filter média' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: 'Fed the shrimp' })).toHaveCount(0);
	// a range picked from the menu again wins over the dates
	await page.getByLabel('Date range').selectOption('7');
	await expect(page.getByLabel('Date range')).toHaveValue('7');
	await expect(page.locator('a.row', { hasText: 'Fed the shrimp' })).toHaveCount(1);
});
