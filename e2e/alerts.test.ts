import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, pickDate } from './helpers';

// #195: Alerts is a page, from the bell: readings out of range and overdue tasks
// across the tanks, with Mark read / unread, a tank filter, Unread only, and
// Log test, Snooze and Mark done on the rows.
test('alerts page: readings out of range and overdue tasks, read state, filters and actions', async ({ page }, info) => {
	const phone = info.project.name === 'phone';
	await newKeeperWithTank(page, `alerts-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// nitrate high, so there's a reading to flag
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Nitrate', { exact: true }).fill('45');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	// the water change overdue: due two days back, so it's overdue in any time zone
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, href!);
	await pickDate(page, 'nextDue', new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	// a second tank, with nothing wrong, for the filter
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Shrimp 10');
	await page.locator('label', { hasText: 'Freshwater' }).click();
	await page.getByLabel('Volume').fill('10');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank created');

	// the bell counts both unread, and is the way to the page
	const bell = phone ? page.getByRole('link', { name: /^Alerts/ }).first() : page.getByRole('navigation', { name: 'App' }).getByRole('link', { name: /^Alerts/ });
	await open(page, phone ? '/more' : `/?tank=${tankId}`);
	await expect(bell).toContainText('2 unread');
	await bell.click();
	await expect(page).toHaveURL(/\/alerts$/);
	await expect(page.getByRole('heading', { name: 'Alerts' }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Out of range · 1' })).toBeVisible();
	const no3 = page.locator('.row', { hasText: 'Nitrate high · 45 ppm' });
	await expect(no3).toContainText('✕ High');
	await expect(no3).toContainText('Riverbed 40 · Target');
	await expect(no3.getByRole('link', { name: 'Log test' })).toHaveAttribute('href', `/entries/test/new?tank=${tankId}`);
	await expect(page.getByRole('heading', { name: 'Overdue · 1' })).toBeVisible();
	const wc = page.locator('.row', { hasText: 'Water change 25%' });
	await expect(wc).toContainText(/✕ Overdue \d+ days?/);
	await expect(wc).toContainText('Riverbed 40 · every 7 days');
	await expect(page.getByRole('link', { name: 'All · 2' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Unread · 2' })).toBeVisible();

	// Mark read keeps the row and takes it off the bell; Mark unread puts it back
	await no3.getByRole('button', { name: 'Mark read' }).click();
	await expect(no3.getByRole('button', { name: 'Mark unread' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Unread · 1' })).toBeVisible();
	if (!phone) await expect(bell).toContainText('1 unread');
	await no3.getByRole('button', { name: 'Mark unread' }).click();
	await expect(page.getByRole('link', { name: 'Unread · 2' })).toBeVisible();

	// the tank filter: the new tank has nothing
	const tankFilter = page.getByRole('group', { name: 'Filter by tank' });
	await tankFilter.getByRole('link', { name: 'Shrimp 10' }).click();
	await expect(page.getByText("You're all caught up.")).toBeVisible();
	await tankFilter.getByRole('link', { name: 'All tanks' }).click();
	await expect(no3).toBeVisible();

	// Mark all read: the bell is clear, Unread only lists nothing, and All still has both
	await page.getByRole('button', { name: 'Mark all read' }).click();
	await expect(page.getByRole('link', { name: 'Unread · 0' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
	if (!phone) await expect(bell).not.toContainText('unread');
	await page.getByRole('link', { name: 'Unread · 0' }).click();
	await expect(page.getByText("You're all caught up.")).toBeVisible();
	await page.getByRole('link', { name: 'All · 2' }).click();

	// Mark done from here works as on Tasks: a water change opens its log form, for this task
	await wc.getByRole('button', { name: 'Mark Water change 25% done' }).click();
	await expect(page).toHaveURL(/\/entries\/event\/new\?.*category=water_change/);
	await expect(page).toHaveURL(/[?&]task=/);

	// opening a reading goes to its chart
	await open(page, '/alerts');
	await no3.getByRole('link', { name: 'Nitrate high · 45 ppm' }).click();
	await expect(page).toHaveURL(new RegExp(`/charts\\?tank=${tankId}&p=`));

	if (!phone) {
		// G then N, from anywhere
		await open(page, `/?tank=${tankId}`);
		await page.keyboard.press('g');
		await page.keyboard.press('n');
		await expect(page).toHaveURL(/\/alerts$/);
	}
});

test('alerts page: nothing to show', async ({ page }, info) => {
	await newKeeperWithTank(page, `alerts0-${info.project.name}`);
	await open(page, '/alerts');
	await expect(page.getByRole('heading', { name: 'Nothing needs attention' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Notification settings' }).first()).toHaveAttribute('href', '/settings#notifications');
	await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
});
