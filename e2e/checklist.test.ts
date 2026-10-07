import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #82: a new tank's dashboard walks through what to do next, ticking steps off
// from the tank's own data; hide it, and Tank setup brings it back.
test('the getting-started checklist follows a new tank, and can be hidden and brought back', async ({ page }, info) => {
	await newKeeperWithTank(page, `start-${info.project.name}`); // planted
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const start = page.getByRole('region', { name: 'Getting started' });
	await expect(start).toBeVisible();
	await expect(start.getByText('2 of 7 done')).toBeVisible();
	const step = (title: string) => start.getByRole('listitem').filter({ hasText: title });
	await expect(step('Tank created')).toContainText('Done');
	await expect(step('Water-change reminder')).toContainText('Done');
	await expect(step('Log the first water test')).toContainText('To do');
	await expect(step('Add plants')).toContainText('To do');

	// a logged test ticks its step off
	await step('Log the first water test').getByRole('link').click();
	await expect(page).toHaveURL(new RegExp(`/entries/test/new\\?tank=${tankId}`));
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await expect(start.getByText('3 of 7 done')).toBeVisible();
	await expect(step('Log the first water test')).toContainText('Done');

	// hidden, it stays hidden; Tank setup brings it back
	await start.getByRole('button', { name: 'Hide checklist' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Checklist hidden');
	await expect(start).toHaveCount(0);
	await open(page, `/?tank=${tankId}`);
	await expect(start).toHaveCount(0);
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByRole('button', { name: 'Show it on the dashboard' }).click();
	await expect(page.getByRole('status')).toContainText('✓ The checklist is back on the dashboard');
	await expect(start).toBeVisible();
	await expect(start.getByText('3 of 7 done')).toBeVisible();
});

test('a tank that is not planted has no plants step, and a cycling one talks through the cycle', async ({ page }, info) => {
	await newKeeperWithTank(page, `start-fw-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const start = page.getByRole('region', { name: 'Getting started' });
	await expect(start.getByText('2 of 6 done')).toBeVisible();
	await expect(start.getByText('Add plants')).toHaveCount(0);
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('This tank is still cycling').check();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await open(page, `/?tank=${tankId}`);
	await expect(start).toContainText('Ammonia, nitrite and nitrate every few days');
});
