import { expect, test } from '@playwright/test';
import { dateValue, newKeeperWithTank, open } from './helpers';

// #96 a planted tank's Growing setup in Tank setup, #97 the same at a glance on the dashboard.
test('a planted tank shows its growing setup together, and at a glance on the dashboard', async ({ page }, info) => {
	await newKeeperWithTank(page, `growing-${info.project.name}`); // planted
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// nothing set yet: no growing rows, and no empty ones either
	const inTank = page.getByRole('region', { name: 'In the tank' });
	await expect(inTank).toBeVisible();
	await expect(inTank.getByText('Substrate')).toHaveCount(0);

	// Tank setup: the Growing setup section, with its fields and the fertilizer routines
	await open(page, `${base}/settings`);
	await expect(page.getByRole('heading', { name: 'Growing setup' })).toBeVisible();
	await expect(page.getByText('No dosing routine yet.')).toBeVisible();
	await page.getByLabel('Substrate', { exact: true }).fill('Aquasoil');
	await page.getByLabel('Lights on', { exact: true }).fill('08:00');
	await page.getByLabel('Lights off', { exact: true }).fill('16:00');
	await page.getByLabel('CO₂ on', { exact: true }).fill('07:00');
	await page.getByLabel('CO₂ off', { exact: true }).fill('15:00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');

	// a dosing routine, from the tank's Routines
	await open(page, base);
	await page.getByRole('region', { name: 'Routines' }).getByRole('link', { name: 'Add dosing' }).click();
	await page.getByLabel('Product').fill('Thrive S');
	await page.getByLabel('Amount').fill('1');
	await page.getByLabel('Unit').selectOption('pumps');
	await page.getByText('On days', { exact: true }).click();
	const today = await dateValue(page, 'nextDue');
	const weekday = new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
	await page.getByRole('checkbox', { name: weekday }).check({ force: true });
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive S added');

	// the dashboard: light, CO₂ against it, the fertilizer and the substrate, each a link
	await open(page, `/?tank=${tankId}`);
	const row = (title: string) => inTank.locator('a.growing', { has: page.locator('.f-title', { hasText: new RegExp(`^${title}$`) }) });
	await expect(row('Light')).toContainText('8 h/day · 08:00–16:00');
	await expect(row('Light')).toHaveAttribute('href', `${base}/settings#lights`);
	await expect(row('CO₂')).toContainText('07:00–15:00 · on 1 h before the lights · off 1 h before the lights');
	await expect(row('Fertilizer')).toContainText('Thrive S 1 pumps');
	await expect(row('Fertilizer')).toContainText('due today');
	await expect(row('Fertilizer')).toHaveAttribute('href', /\/tasks\//);
	await expect(row('Substrate')).toContainText('Aquasoil');
	await expect(inTank.getByText('Schedule', { exact: true })).toHaveCount(0);

	// and Tank setup lists the routine under Fertilizer
	await open(page, `${base}/settings`);
	const routines = page.getByRole('list', { name: 'Dosing routines' });
	await expect(routines).toContainText('Thrive S 1 pumps');
	await expect(routines).toContainText('due today');
});

test('a tank that is not planted keeps its plain schedule line', async ({ page }, info) => {
	await newKeeperWithTank(page, `growing-fw-${info.project.name}`, 'Freshwater');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.getByRole('heading', { name: 'Growing setup' })).toHaveCount(0);
	await expect(page.getByText('Fertilizer', { exact: true })).toHaveCount(0);
	await page.getByLabel('Lights on', { exact: true }).fill('09:00');
	await page.getByLabel('Lights off', { exact: true }).fill('17:00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');
	await open(page, `/?tank=${tankId}`);
	const inTank = page.getByRole('region', { name: 'In the tank' });
	await expect(inTank.getByText('Schedule', { exact: true })).toBeVisible();
	await expect(inTank.getByText('Lights 09:00–17:00')).toBeVisible();
	await expect(inTank.locator('a.growing')).toHaveCount(0);
});
