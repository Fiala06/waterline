import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #310: the first reminder says when it goes and how it reaches the keeper, from their settings as they are
test('the water-change reminder says how it will reach you', async ({ page }, info) => {
	await newKeeperWithTank(page, `delivery-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const start = page.getByRole('region', { name: 'Getting started' });
	await expect(start).toContainText('Next reminder');
	// email works on this server; push isn't set up, and nothing asked for permission
	await expect(start).toContainText('✓ Email');
	await expect(start).toContainText('– Push not set up');
	await expect(start).toContainText('Not on this device');
	await expect(start).toContainText('Waterline can say it sent a reminder, not that it arrived.');
	await expect(start.getByRole('link', { name: 'Push settings ›' })).toHaveAttribute('href', '/settings#push');

	// email off too: in Waterline only, and the task's own page says the same
	await open(page, '/settings#notifications');
	const saved = page.waitForResponse((r) => r.url().includes('?/notifications') && r.request().method() === 'POST');
	await page.getByRole('checkbox', { name: 'Task reminders by email' }).uncheck();
	await saved;
	await open(page, `/?tank=${tankId}`);
	await expect(start).toContainText('– Email off');
	await expect(start).toContainText('In Waterline only: it shows under Tasks and on the dashboard on its day.');
	await start.getByRole('link', { name: /Water-change reminder/ }).click();
	const reminders = page.getByRole('region', { name: 'Reminders' });
	await expect(reminders).toContainText('Task reminders are turned off for email.');
	await expect(reminders).toContainText('In Waterline only');
});

// #323: a paused task promises no send date, email or push until it resumes
test('a paused reminder says it is paused, on Getting started and the task', async ({ page }, info) => {
	await newKeeperWithTank(page, `delivery-paused-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const start = page.getByRole('region', { name: 'Getting started' });
	await expect(start).toContainText('✓ Email');

	await open(page, '/tasks');
	await page.getByRole('link', { name: 'Pause tasks for a while ›' }).click();
	await page.getByRole('checkbox', { name: /Review tank setup/ }).uncheck();
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Paused · 1' })).toBeVisible();

	await open(page, `/?tank=${tankId}`);
	await expect(start).toContainText('– Reminders paused until');
	await expect(start).toContainText('No email or push goes until then.');
	await expect(start).not.toContainText('Next reminder');
	await expect(start).not.toContainText('✓ Email');
	await start.getByRole('link', { name: /Water-change reminder/ }).click();
	const reminders = page.getByRole('region', { name: 'Reminders' });
	await expect(reminders).toContainText('– Reminders paused until');
	await expect(reminders).not.toContainText('✓ Email');
	await expect(reminders).not.toContainText('Next reminder');

	// resumed: the forecast is back, from its dates as they are now
	await open(page, '/tasks');
	await page.getByRole('button', { name: /^Resume Water change/ }).click();
	await expect(page.getByRole('status')).toContainText('Resumed');
	await open(page, `/?tank=${tankId}`);
	await expect(start).toContainText('Next reminder');
	await expect(start).toContainText('✓ Email');
	await expect(start).not.toContainText('Reminders paused');
});
