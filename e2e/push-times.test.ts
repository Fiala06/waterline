import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #180: a task's time of day, and Settings › Notifications' one push per tank and quiet hours
test('a task pushed at a time of its own, and quiet hours in Settings', async ({ page }, info) => {
	await newKeeperWithTank(page, `push-times-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a tank without a light schedule offers the send time or a time
	await open(page, `/tasks/new?tank=${tankId}`);
	await page.getByRole('textbox', { name: 'Task' }).fill('Feed the plecos');
	const when = page.getByLabel('Push it', { exact: true });
	await expect(when.locator('option')).toHaveText(['At my send time', 'At a set time']);
	await expect(page.getByLabel('Push it at')).toBeHidden();
	await when.selectOption('time');
	await page.getByLabel('Push it at').fill('21:30');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Feed the plecos added');
	await expect(page.locator('.row', { hasText: 'Feed the plecos' })).toContainText('at 9:30 PM');

	// with lights on a schedule, the light choices are there too
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('Lights on', { exact: true }).fill('10:00');
	await page.getByLabel('Lights off', { exact: true }).fill('18:00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');
	await open(page, `/tasks/new?tank=${tankId}`);
	await expect(page.getByLabel('Push it', { exact: true }).locator('option')).toHaveText(['At my send time', 'Before lights on', 'At lights off', 'At a set time']);

	// one push per tank is on; quiet hours are off until a start is picked
	await open(page, '/settings#notifications');
	await expect(page.getByLabel('One push per tank')).toBeChecked();
	const quiet = page.getByLabel('Quiet hours', { exact: true });
	await expect(quiet).toHaveValue('');
	await quiet.selectOption('22:00');
	await expect(page.getByRole('status')).toContainText('✓ Notification settings saved');
	await expect(page.getByText('Nothing is pushed then.')).toBeVisible();
	// saved once its post is answered
	await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('notifications')), page.getByLabel('Quiet hours end').selectOption('06:00')]);
	await page.reload();
	await expect(page.getByLabel('Quiet hours', { exact: true })).toHaveValue('22:00');
	await expect(page.getByLabel('Quiet hours end')).toHaveValue('06:00');
});
