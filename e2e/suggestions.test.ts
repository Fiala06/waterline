import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

const logTest = async (page: import('@playwright/test').Page, tankId: string, label: string, value: string) => {
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel(label, { exact: true }).fill(value);
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
};

// #179: ammonia in a cycled tank suggests the water change every 2 days until it reads 0
test('ammonia suggests water changes until it reads 0, and a clear test ends them', async ({ page }, info) => {
	await newKeeperWithTank(page, `sug-a-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await logTest(page, tankId, 'Ammonia', '0.5');
	// a new tank is asked about first; not cycling, the step shows
	await page.getByRole('region', { name: /New tank\?/ }).getByRole('button', { name: 'Not cycling' }).click();
	const attention = page.getByRole('region', { name: 'Needs attention' });
	await expect(attention).toContainText('Suggested step');
	await attention.getByRole('button', { name: 'Water change every 2 days until ammonia reads 0' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change 25%: every 2 days until ammonia reads 0');
	await expect(attention.getByRole('button', { name: /^Water change every 2 days/ })).toHaveCount(0);
	await open(page, '/tasks');
	await expect(page.locator('.row', { hasText: 'Water change 25%' })).toContainText('every 2 days until ammonia reads 0 · then every 7 days');

	// the test that reads 0 puts it back, and History says why
	await logTest(page, tankId, 'Ammonia', '0');
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: 'Water change 25%: back to every 7 days: ammonia reads 0' })).toBeVisible();
});

// #179: nitrate at 0 in a dosed tank suggests Dose now; Don't suggest this switches it off, with Undo
test('nitrate at 0 suggests a dose, and can be switched off for the tank', async ({ page }, info) => {
	await newKeeperWithTank(page, `sug-n-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tasks/new?tank=${tankId}&type=dosing`);
	await page.getByLabel('Product').fill('Thrive S');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive S added');

	await logTest(page, tankId, 'Nitrate', '0');
	const attention = page.getByRole('region', { name: 'Needs attention' });
	const dose = attention.getByRole('link', { name: 'Dose now' });
	await expect(dose).toHaveAttribute('href', `/entries/event/new?tank=${tankId}&category=dosing&product=Thrive+S`);
	// the test's own page suggests it too
	await page.getByRole('status').getByRole('link', { name: 'View' }).click();
	await expect(page.getByRole('link', { name: 'Dose now' })).toBeVisible();

	await open(page, `/?tank=${tankId}`);
	await attention.getByRole('button', { name: 'Don’t suggest this' }).click();
	await expect(page.getByRole('status')).toContainText('Won’t suggest that for Riverbed 40');
	await expect(dose).toHaveCount(0);
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(dose).toBeVisible();

	// Tank setup › Suggested steps: the rules with their sources, on or off
	await open(page, `/tanks/${tankId}/suggestions`);
	const rule = page.getByRole('checkbox', { name: /Nitrate at 0 in a dosed tank/ });
	await expect(rule).toBeChecked();
	await expect(page.getByText(/Source: The Barr Report/)).toBeVisible();
	await rule.uncheck();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Suggested steps saved');
	await open(page, `/?tank=${tankId}`);
	await expect(attention).toBeVisible();
	await expect(dose).toHaveCount(0);
});

// #179: a pause until a reading clears ends with the test that clears it
test('a pause until ammonia reads 0 resumes with the test that reads it', async ({ page }, info) => {
	await newKeeperWithTank(page, `sug-p-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/pause`);
	await page.getByRole('checkbox', { name: /Review tank setup/ }).uncheck();
	await page.getByLabel('Or sooner, when a test reads in range').selectOption({ label: 'Until ammonia reads 0' });
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('Paused 1 task until ammonia reads 0');
	await expect(page.locator('.row.paused', { hasText: 'Water change 25%' })).toContainText('‖ Paused until ammonia reads 0');

	await logTest(page, tankId, 'Ammonia', '0');
	await open(page, '/tasks');
	await expect(page.getByRole('heading', { name: /^Paused/ })).toHaveCount(0);
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: 'Resumed Water change 25%: ammonia reads 0' })).toBeVisible();
});
