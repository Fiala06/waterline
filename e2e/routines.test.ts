import { expect, test } from '@playwright/test';
import { dateValue, newKeeperWithTank, open } from './helpers';

// Dosing and feeding routines (#17): made from the tank's page, marked done
// there or on the dashboard, and each Done logs the dose or the feeding.

test('a dosing routine on set days: Done logs the dose, Undo takes it back', async ({ page }, info) => {
	await newKeeperWithTank(page, `routine-dose-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	await open(page, base);
	const routines = page.getByRole('region', { name: 'Routines' });
	await expect(routines.getByText('Dosing and feeding on a schedule. Marking one done logs it in History.')).toBeVisible();
	await routines.getByRole('link', { name: 'Add dosing' }).click();
	await expect(page.getByRole('heading', { name: 'New dosing routine' }).first()).toBeVisible();

	await page.getByLabel('Product').fill('Thrive S');
	await page.getByLabel('Amount').fill('1');
	await page.getByLabel('Unit').selectOption('pumps');
	await page.getByText('On days', { exact: true }).click();
	// no day picked yet
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByText('✕ Pick at least one day.')).toBeVisible();
	// due today: today's day of the week
	const today = await dateValue(page, 'nextDue');
	const weekday = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
	await page.getByRole('checkbox', { name: weekday }).check({ force: true });
	await expect(page.getByText('Marking it done logs the dose in History.')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();

	// back on the tank's page
	await expect(page).toHaveURL(base);
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive S added');
	await expect(routines.getByRole('listitem')).toHaveCount(1);
	await expect(routines.getByRole('listitem')).toContainText('Dose Thrive S');
	await expect(routines.getByRole('listitem')).toContainText(`1 pump · ${weekday.slice(0, 3)} · ▲ Today`);

	// Done: the dose is in History, and the next one is a week on
	await routines.getByRole('button', { name: 'Mark Dose Thrive S done' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive S done · next');
	await expect(routines.getByRole('listitem')).not.toContainText('Today');
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Dose Thrive S');
	await expect(routines.getByRole('listitem')).toContainText('▲ Today');
	await open(page, `/history?tank=${tankId}&cat=dosing&range=all`);
	await expect(page.getByText('Dosed Thrive S')).toHaveCount(0);

	await open(page, base);
	await routines.getByRole('button', { name: 'Mark Dose Thrive S done' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive S done');
	await open(page, `/history?tank=${tankId}&cat=dosing&range=all`);
	await expect(page.getByRole('link', { name: 'Dosed Thrive S · 1 pump' })).toBeVisible();

	// it's a task too: on the Tasks page with its amount and days
	await open(page, '/tasks');
	await expect(page.getByRole('link', { name: /Dose Thrive S/ }).first()).toContainText('1 pump');
});

test('a daily feeding routine: done from the dashboard, the feeding is in History and can be edited', async ({ page }, info) => {
	await newKeeperWithTank(page, `routine-feed-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}`);
	await page.getByRole('region', { name: 'Routines' }).getByRole('link', { name: 'Add feeding' }).click();
	await expect(page.getByRole('heading', { name: 'New feeding routine' }).first()).toBeVisible();
	await page.getByLabel('Food').fill('Micro pellets');
	await page.getByLabel('Amount').fill('2');
	await page.getByLabel('Unit').selectOption('pinches');
	await expect(page.getByText('Marking it done logs the feeding in History.')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Feed Micro pellets added');
	await expect(page.getByRole('region', { name: 'Routines' }).getByRole('listitem')).toContainText('2 pinches · every day');

	// the dashboard's Due list has it today
	await open(page, `/?tank=${tankId}`);
	const row = page.locator('.row', { hasText: 'Feed Micro pellets' });
	await expect(row).toContainText('▲ Today · 2 pinches');
	await row.getByRole('button', { name: 'Mark done' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Feed Micro pellets done');

	// in History under Feeding, and editable
	await open(page, `/history?tank=${tankId}&cat=feeding&range=all`);
	const entry = (await page.getByRole('link', { name: 'Fed 2 pinches of Micro pellets' }).getAttribute('href'))!;
	await open(page, entry);
	await expect(page.getByText('Food', { exact: true })).toBeVisible();
	await open(page, `${entry}/edit`);
	await page.getByLabel('Amount').fill('3');
	await page.getByRole('button', { name: 'Save changes' }).click();
	// saved once it leaves the edit page; History opened sooner can beat the save
	await page.waitForURL((u) => !u.pathname.endsWith('/edit'));
	await open(page, `/history?tank=${tankId}&cat=feeding&range=all`);
	await expect(page.getByRole('link', { name: 'Fed 3 pinches of Micro pellets' })).toBeVisible();
});
