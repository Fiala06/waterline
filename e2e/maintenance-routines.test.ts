import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, openQuickAdd } from './helpers';

// Maintenance routines (#92): a named sequence of log steps, run one at a
// time, each an ordinary History entry; any step can be skipped.

test('build a routine, run it with a skip, and find each logged step in History', async ({ page }, info) => {
	await newKeeperWithTank(page, `mroutine-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// from the tank's page
	await open(page, base);
	await page.getByRole('link', { name: 'Maintenance routines' }).click();
	await expect(page).toHaveURL(`${base}/routines`);
	await expect(page.getByText('No routines yet')).toBeVisible();
	await page.getByLabel('Name', { exact: true }).fill('Sunday maintenance');
	await page.getByRole('button', { name: 'Add routine' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Sunday maintenance added');

	// steps: a 40% water change, a dose, a trim, a test
	const routine = page.getByRole('region', { name: /Sunday maintenance/ });
	const stepForm = routine.locator('form.step-form');
	await expect(stepForm).toBeVisible(); // open after adding
	await stepForm.getByRole('radio', { name: 'Water change' }).check({ force: true });
	await stepForm.locator('.for-water_change').getByLabel('Amount', { exact: true }).fill('40');
	await stepForm.getByRole('button', { name: 'Add step' }).click();
	await expect(page.getByRole('status')).toContainText('✓ 40% water change added');
	await stepForm.getByRole('radio', { name: 'Dose' }).check({ force: true });
	await stepForm.getByLabel('Product').fill('Thrive');
	await stepForm.locator('.for-dosing').getByLabel('Amount', { exact: true }).fill('6');
	await stepForm.getByRole('button', { name: 'Add step' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Dose Thrive 6 mL added');
	await stepForm.getByRole('radio', { name: 'Maintenance' }).check({ force: true });
	await stepForm.getByRole('checkbox', { name: 'Trimmed plants' }).check({ force: true });
	await stepForm.getByRole('button', { name: 'Add step' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Trimmed plants added');
	await stepForm.getByRole('radio', { name: 'Water test' }).check({ force: true });
	await stepForm.getByRole('button', { name: 'Add step' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water test added');
	const steps = routine.getByRole('list', { name: 'Steps of Sunday maintenance' }).getByRole('listitem');
	await expect(steps).toHaveCount(4);
	// the trim before the dose
	await page.getByRole('button', { name: 'Move step 3 up' }).click();
	await expect(steps.nth(1)).toContainText('Trimmed plants');
	await expect(steps.nth(2)).toContainText('Dose Thrive 6 mL');

	// run it: log the water change, skip the trim, log the dose, log the test
	await routine.getByRole('link', { name: /^Run/ }).click();
	await expect(page).toHaveURL(new RegExp(`${base}/routines/[^/]+/run$`));
	await expect(page.getByText('Step 1 of 4')).toBeVisible();
	await expect(page.getByRole('heading', { name: '40% water change' })).toBeVisible();
	await page.getByRole('link', { name: 'Log it ›' }).click();
	await expect(page).toHaveURL(/category=water_change.*amount=40/);
	await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('40');
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');
	// back on the run, at step 2
	await expect(page).toHaveURL(/\/run\?i=1&done=0$/);
	await expect(page.getByText('Step 2 of 4')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Trimmed plants' })).toBeVisible();
	await page.getByRole('link', { name: 'Skip', exact: true }).click();
	await expect(page).toHaveURL(/\/run\?i=2&done=0&skipped=1$/);
	await expect(page.getByRole('heading', { name: 'Dose Thrive 6 mL' })).toBeVisible();
	await page.getByRole('link', { name: 'Log it ›' }).click();
	await expect(page.getByLabel('Product', { exact: true })).toHaveValue('Thrive');
	await page.getByRole('button', { name: 'Save dosing' }).click();
	await expect(page.getByRole('status')).toContainText('✓');
	await expect(page.getByText('Step 4 of 4')).toBeVisible();
	await page.getByRole('link', { name: 'Log it ›' }).click();
	await expect(page).toHaveURL(/\/entries\/test\/new\?tank=.*from=/);
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	// done: the summary, and the steps' marks
	await expect(page.getByRole('heading', { name: '✓ Routine done' })).toBeVisible();
	await expect(page.getByText('3 steps logged, 1 skipped.')).toBeVisible();
	const list = page.getByRole('region', { name: 'Steps' }).getByRole('listitem');
	await expect(list.nth(0)).toContainText('✓ Logged');
	await expect(list.nth(1)).toContainText('– Skipped');
	await expect(list.nth(3)).toContainText('✓ Logged');

	// every logged step is an ordinary entry
	await open(page, `/history?tank=${tankId}&range=all`);
	await expect(page.getByText('Water change · 40% · Tap').first()).toBeVisible();
	await expect(page.getByText('Dosed Thrive · 6 mL').first()).toBeVisible();
	await expect(page.getByText(/Water test ·/).first()).toBeVisible();
	await expect(page.getByText('Trimmed plants')).toHaveCount(0);

	// and it's a Run away from Quick add
	await open(page, `/?tank=${tankId}`);
	await openQuickAdd(page);
	await expect(page.getByRole('dialog', { name: 'Quick add' }).getByRole('link', { name: /Run Sunday maintenance/ })).toBeVisible();
});
