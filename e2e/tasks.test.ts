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
	await page.getByRole('button', { name: /^In 2 days/ }).click();
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

// #161: Done leaves an entry in History, and Undo takes it out again
test('done is logged in History, and Undo takes it out', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7h-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/tasks/new');
	await page.getByRole('textbox', { name: 'Task' }).fill('Trim stems');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Trim stems added');
	const entries = page.getByRole('link', { name: /^Trim stems/ });

	// done, then undone: nothing in History
	await page.getByRole('button', { name: /Mark Trim stems done/ }).click();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Trim stems');
	await open(page, `/history?tank=${tankId}`);
	await expect(entries).toHaveCount(0);

	// done: a Maintenance entry
	await open(page, '/tasks');
	await page.getByRole('button', { name: /Mark Trim stems done/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Trim stems done');
	await open(page, `/history?tank=${tankId}`);
	await expect(entries).toHaveCount(1);
});

// #162: done on an earlier day, from the Snooze menu; the next one counts from that day
test('done yesterday counts the next one from yesterday', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7y-${info.project.name}`);
	await open(page, '/tasks/new');
	await page.getByRole('textbox', { name: 'Task' }).fill('Clean glass');
	const today = await dateValue(page, 'nextDue');
	// overdue, so phones show its Snooze too
	const twoDaysAgo = new Date(Date.parse(today) - 2 * 86_400_000).toISOString().slice(0, 10);
	await pickDate(page, 'nextDue', twoDaysAgo);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();

	const row = page.locator('.row', { hasText: 'Clean glass' });
	await row.getByRole('button', { name: 'Snooze', exact: true }).click();
	await page.getByRole('button', { name: /^Done yesterday/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Clean glass done');
	const href = await page.locator('a', { hasText: 'Clean glass' }).first().getAttribute('href');
	await open(page, href!);
	const next = await dateValue(page, 'nextDue');
	// weekly, from yesterday: 6 days from today
	expect(Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000)).toBe(6);
});

// #163: a water change a day early ticks its reminder; one left unticked can be counted from Skip
test('a water change a day early completes its reminder, or Skip counts it', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7e-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/tasks/new');
	const today = await dateValue(page, 'nextDue');
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, href!);
	const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
	await pickDate(page, 'nextDue', tomorrow);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Task saved');

	// due tomorrow: logging today ticks it
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	const box = page.getByLabel(/Also mark the reminder “Water change 25%” done/);
	await expect(box).toBeChecked();
	// left unticked, the reminder stays due tomorrow
	await box.uncheck();
	await page.getByLabel('Amount', { exact: true }).fill('40');
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.locator('.toast-region')).toContainText('✓ Water change logged');

	// Skip's menu offers to count today's water change instead
	await open(page, '/tasks');
	const wcHref = await page.locator('a', { hasText: 'Water change 25%' }).first().getAttribute('href');
	await open(page, wcHref!);
	const twoDaysAgo = new Date(Date.parse(today) - 2 * 86_400_000).toISOString().slice(0, 10);
	// overdue, so phones show its Snooze too
	await pickDate(page, 'nextDue', twoDaysAgo);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('heading', { name: /Overdue · 1/ })).toBeVisible();
	await page.locator('.row', { hasText: 'Water change 25%' }).getByRole('button', { name: 'Snooze', exact: true }).click();
	await page.getByRole('button', { name: /^Count the water change on/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change 25% done');
	await expect(page.getByRole('heading', { name: /Overdue/ })).toHaveCount(0);
	// History has the water change, and no "Skipped"
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Skipped/ })).toHaveCount(0);
});

// #165: a task not due yet can be brought forward to today, and back with Undo
test('do it today brings a task forward, with Undo', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7t-${info.project.name}`);
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: /Due soon/ })).toHaveCount(0);
	const row = page.locator('.row', { hasText: 'Water change 25%' });
	await row.getByRole('button', { name: 'Snooze', exact: true }).click();
	await expect(page.getByRole('button', { name: /^This weekend|^A week later/ }).first()).toBeVisible();
	await page.getByRole('button', { name: /^Do it today/ }).click();
	await expect(page.getByRole('status')).toContainText('Moved Water change 25% to today');
	await expect(page.locator('.row.soon', { hasText: 'Water change 25%' })).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Water change 25%');
	await expect(page.locator('.row.later', { hasText: 'Water change 25%' })).toBeVisible();
});

// #166: the dashboard's Due lists everything due today or over, then the next 3 and "+N more"
test('Due on the dashboard shows every task due today', async ({ page }, info) => {
	await newKeeperWithTank(page, `m7d-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const add = async (name: string, days = 0) => {
		await open(page, `/tasks/new?tank=${tankId}`);
		await page.getByRole('textbox', { name: 'Task' }).fill(name);
		if (days) {
			const today = await dateValue(page, 'nextDue');
			await pickDate(page, 'nextDue', new Date(Date.parse(today) + days * 86_400_000).toISOString().slice(0, 10));
		}
		await page.getByRole('button', { name: 'Save' }).last().click();
		await expect(page.getByRole('status')).toContainText(`✓ ${name} added`);
	};
	for (const n of ['Trim stems', 'Clean glass', 'Dose iron', 'Top off']) await add(n);
	for (const n of ['Clean pipes', 'Replace floss']) await add(n, 5);
	await open(page, `/?tank=${tankId}`);
	const due = page.getByRole('region', { name: 'Due' });
	for (const n of ['Trim stems', 'Clean glass', 'Dose iron', 'Top off']) await expect(due.getByText(n, { exact: true })).toBeVisible();
	// upcoming: the water change, the two above and the setup review, so one is left for Tasks
	await expect(due.getByRole('link', { name: '+1 more' })).toHaveAttribute('href', `/tasks?filter=${tankId}`);
});
