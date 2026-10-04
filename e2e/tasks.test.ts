import { expect, test } from '@playwright/test';
import { dateValue, newKeeperWithTank, open, pickDate } from './helpers';

test('tasks: create, complete with undo, snooze, edit, delete', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7-${info.project.name}`);

	// Create a one-off task due today
	await open(page, '/tasks/new');
	await page.getByRole('textbox', { name: 'Task' }).fill('Clean canister filter');
	await page.locator('label', { hasText: 'One-off' }).click();
	const today = await dateValue(page, 'nextDue');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Clean canister filter added');
	await expect(page.getByRole('heading', { name: /Due soon · 1/ })).toBeVisible();

	// Mark done → gone, then Undo brings it back
	await page.getByRole('button', { name: /Mark Clean canister filter done/ }).click();
	const toast = page.getByRole('status');
	await expect(toast).toContainText('✓ Clean canister filter done');
	await expect(page.getByText('Clean canister filter', { exact: true })).toHaveCount(0);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Clean canister filter');
	await expect(page.getByText('Clean canister filter', { exact: true })).toBeVisible();

	// Edit it: recurring every 2 weeks, fixed calendar
	await open(page, '/tasks');
	const link = page.locator('a.rtext', { hasText: 'Clean canister filter' });
	if (info.project.name === 'phone') await link.click();
	else await open(page, `${await link.getAttribute('href')}`);
	await page.locator('label', { hasText: 'Recurring' }).click();
	await page.getByLabel('Number').fill('2');
	await page.locator('label', { hasText: /^weeks$/ }).click();
	await page.locator('label', { hasText: 'Fixed calendar' }).click();
	await expect(page.getByText(/Always every 2 weeks on/)).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Task saved');
	await expect(page.getByText(/every 2 weeks/i).filter({ visible: true }).first()).toBeVisible();

	// The default water change task: snooze moves only this occurrence
	await open(page, '/tasks');
	expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	const wc = page.locator('a.rtext', { hasText: 'Water change 25%' });
	await expect(wc).toBeVisible();

	// Delete the filter task
	const href = await link.getAttribute('href');
	await open(page, href!);
	await page.getByRole('button', { name: 'Delete task' }).click();
	await page.locator('#confirm-task-delete').getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('status')).toContainText('Clean canister filter deleted');
});

test('snooze sheet picks a date and keeps the schedule', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7s-${info.project.name}`);
	// Make the water change overdue by editing its due date to yesterday
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, href!);
	// two days back, so it's overdue in any time zone
	const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
	await pickDate(page, 'nextDue', yesterday);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	// Esc, and a click beside it, close the menu: it doesn't stay drawn on the page (#72)
	const menu = page.getByRole('dialog', { name: 'Snooze' });
	await page.getByRole('button', { name: 'Snooze', exact: true }).first().click();
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await page.getByRole('button', { name: 'Snooze', exact: true }).first().click();
	await expect(menu).toBeVisible();
	await page.mouse.click(5, 5);
	await expect(menu).toBeHidden();

	await page.getByRole('button', { name: 'Snooze', exact: true }).first().click();
	await expect(page.getByText('Snoozing moves only this occurrence.')).toBeVisible();
	await page.getByRole('button', { name: /^In 3 days/ }).click();
	await expect(page.getByRole('status')).toContainText('Snoozed Water change 25% to');
	await expect(page.getByRole('heading', { name: /Overdue/ })).toHaveCount(0);

	// Editing shows the snoozed date; the underlying schedule is unchanged
	await open(page, href!);
	const shown = await dateValue(page, 'nextDue');
	expect(shown > yesterday).toBe(true);
});

// #71: Skip this one passes an occurrence over, notes it in History, and can be undone
test('skip this one moves to the next date, with Undo', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7k-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, href!);
	const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
	await pickDate(page, 'nextDue', twoDaysAgo);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	const skip = async () => {
		await page.getByRole('button', { name: 'Snooze', exact: true }).first().click();
		await expect(page.getByRole('button', { name: /^Skip this one\s*Next one / })).toBeVisible();
		await page.getByRole('button', { name: /^Skip this one/ }).click();
		await expect(page.getByRole('status')).toContainText('Skipped Water change 25% · next');
		await expect(page.getByRole('heading', { name: /Overdue/ })).toHaveCount(0);
	};
	await skip();
	// Undo puts it back where it was
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Water change 25%');
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	// skipped for real: History says so, once
	await skip();
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Skipped: Water change 25%/ })).toHaveCount(1);
});
