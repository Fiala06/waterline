import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, tankTitle } from './helpers';

test('dashboard (refresh 1c): the hero, and nothing needing attention when all is in range', async ({ page }, info) => {
	await newKeeperWithTank(page, `dash-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// the tank's name (to switch tanks on a phone), and what it is
	await expect(tankTitle(page, 'Riverbed 40')).toBeVisible();
	await expect(page.getByText('Planted · 40 gal').first()).toBeVisible();

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await expect(page.getByRole('region', { name: 'Needs attention' })).toHaveCount(0);
	const inRange = page.getByRole('region', { name: 'Tank parameters' });
	await expect(inRange).toContainText('✓ All 1 in range');
	await expect(inRange.getByRole('link', { name: /pH\s*7/ })).toBeVisible();
});

test("What's new links to each feature, and a tank's page opens for the tank you're on", async ({ page }, info) => {
	await newKeeperWithTank(page, `links-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/settings/changelog');
	// older releases are folded away: open them all
	for (const fold of await page.locator('summary').all()) await fold.click();
	const link = page.getByRole('link', { name: 'Settings › Calendar' }).first();
	await expect(link).toHaveAttribute('href', '/settings#calendar');
	// /tanks/current/… is that page of the current tank
	await page.getByRole('link', { name: 'Spending tab' }).first().click();
	await expect(page).toHaveURL(`/tanks/${tankId}/spending`);
	await expect(page.getByText('No spending logged yet')).toBeVisible();
});

test('the dashboard opens the tank settings, and a 2.5 gal tank says 2.5 gal', async ({ page }, info) => {
	await newKeeperWithTank(page, `dash-settings-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// the Tank setup tab on a computer; More › Tank setup & targets on a phone
	if (info.project.name === 'phone') {
		await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
		await page.getByRole('link', { name: 'Tank setup & targets' }).click();
	} else {
		await page.getByRole('navigation', { name: 'Tank sections' }).getByRole('link', { name: 'Tank setup' }).click();
	}
	await expect(page).toHaveURL(`/tanks/${tankId}/settings`);
	await page.getByRole('textbox', { name: 'Nominal volume' }).fill('2.5');
	await page.getByRole('button', { name: 'Save changes' }).first().click();
	await expect(page.getByRole('status')).toContainText('saved');
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText('Planted · 2.5 gal').first()).toBeVisible();
});

// Due lists the tank's tasks as the Tasks page does: a water change that's due by the days
// since the last one (its row in Needs attention) is still in Due, not only in Needs attention
test('Due lists the water change when Needs attention has its row too', async ({ page }, info) => {
	await newKeeperWithTank(page, `due-wc-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// a water change 8 days ago; the reminder (every 7 days) isn't due until next week
	const ymd = (d: Date) => d.toISOString().slice(0, 10);
	const today = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z');
	const back = new Date(today.getTime() - 8 * 86_400_000);
	await open(page, `/entries/event/new?tank=${tankId}&category=water_change`);
	await page.getByRole('button', { name: /^When/ }).click();
	const sheet = page.getByRole('dialog', { name: 'When?' });
	if (ymd(back).slice(0, 7) !== ymd(today).slice(0, 7)) await sheet.getByRole('button', { name: 'Previous month' }).click();
	await sheet
		.getByRole('button', { name: back.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), exact: true })
		.click();
	await sheet.getByRole('button', { name: /^Use / }).click();
	await page.getByLabel('Amount', { exact: true }).fill('25');
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');
	// Needs attention shows once there's a reading
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	await open(page, `/?tank=${tankId}`);
	await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('Water change');
	const due = page.getByRole('region', { name: 'Due' });
	await expect(due.locator('.row', { hasText: 'Water change 25%' })).toBeVisible();
	// the same tasks, first to last, as the Tasks page lists for the tank
	await expect(due.locator('.row').first()).toContainText('Water change 25%');
});
