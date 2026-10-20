import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #196: a doser as equipment, with what it doses as its settings, logged in
// History at its time by Waterline (here: the scheduler's run, two days on).
test('a doser and the doses it logs', async ({ page, request }, info) => {
	await newKeeperWithTank(page, `doser-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// A doser with one dose: a product, how much, when, how long the pump runs
	await open(page, `${base}/equipment/new`);
	await page.locator('label', { hasText: /^Doser$/ }).click();
	await page.getByLabel('Brand').fill('Kamoer');
	await page.getByLabel('Model').fill('X1');
	await page.getByLabel('Pump heads').fill('1');
	await page.getByLabel('Product', { exact: true }).fill('Thrive+');
	await page.getByLabel('Amount', { exact: true }).fill('1');
	// just after midnight, so its time has passed whatever the keeper's time zone: logged from tomorrow
	await page.locator('#dose-0-at').fill('00:05');
	await page.getByLabel('Runs for').fill('30');
	await expect(page.getByText('Each mark is a dose in the day.')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Kamoer X1 added');

	// The Equipment tab: the dose on the card with when the next is, and the doser on the day
	await expect(page.getByText('Thrive+ 1 mL at 00:05 every day · runs 30 s')).toBeVisible();
	await expect(page.getByText('● Next tomorrow at 00:05')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'The day' })).toBeVisible();
	await expect(page.getByText('1 head', { exact: true })).toBeVisible();

	// History: what it doses, and nothing logged yet
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Kamoer X1 doses Thrive+ 1 mL at 00:05 every day · runs 30 s').first()).toBeVisible();
	await expect(page.getByText('Dosed Thrive+')).toHaveCount(0);

	// The scheduler, two days on (any time zone is past 00:05 by then): the dose is logged, by the doser
	const later = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
	// (another test's run may log this tank's dose first: History is what counts)
	const tick = await request.post(`/dev/tick?now=${encodeURIComponent(later)}`);
	expect(tick.ok()).toBe(true);
	await open(page, `/history?tank=${tankId}`);
	const dose = page.getByRole('link', { name: /Dosed Thrive\+ · 1 mL/ }).first();
	await expect(dose).toBeVisible();
	await expect(dose).toContainText('by the doser');
	await dose.click();
	// the entry says which doser made it, leading to its page
	await expect(page.getByText('Kamoer X1 · doser ›').first()).toBeVisible();

	// The doser's page lists what it logged, and a change to its doses is kept in History
	await open(page, `${base}/equipment`);
	await page.locator('a[href*="/equipment/"]').filter({ hasText: 'Kamoer X1' }).first().click();
	await expect(page).toHaveURL(/\/equipment\/[^/]+$/);
	await expect(page.getByText('Logged by the doser · 1')).toBeVisible();
	await expect(page.getByText('last logged')).toHaveCount(0);
	await page.getByLabel('Amount', { exact: true }).fill('2');
	await page.getByLabel('Sunday, dose 1').uncheck();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Equipment saved');
	await expect(page.getByText('Thrive+ 2 mL at 00:05 every day but Sun · runs 30 s')).toBeVisible();
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Kamoer X1 doses Thrive+ 2 mL at 00:05 every day but Sun · runs 30 s').first()).toBeVisible();

	// A planted tank's growing setup on the dashboard names it
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText('Thrive+ 2 mL at 00:05 every day but Sun · by the doser')).toBeVisible();

	// A dose can't be saved half filled in
	await open(page, `${base}/equipment/new`);
	await page.locator('label', { hasText: /^Doser$/ }).click();
	await page.getByLabel('Brand').fill('Jebao');
	await page.getByLabel('Product', { exact: true }).fill('Excel');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByText('✕ Enter how much, in mL.')).toBeVisible();
	await expect(page.getByText('✕ Pick a time.')).toBeVisible();
});
