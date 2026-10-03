import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #21: a test kit's steps run with a timer on the water test form.
test('test kits: a preset, a kit of your own, and a timer on the form', async ({ page }, info) => {
	await newKeeperWithTank(page, `kits-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// A preset fills the add form
	await open(page, '/settings/test-kits');
	await expect(page.getByText('No kits yet')).toBeVisible();
	await page.getByRole('link', { name: /API Nitrate/ }).click();
	await expect(page.getByRole('heading', { name: 'Add API Nitrate' })).toBeVisible();
	await expect(page.locator('#add-steps')).toHaveValue(/Wait 5 min/);
	await page.getByRole('button', { name: 'Add kit' }).click();
	await expect(page.getByRole('status')).toContainText('✓ API Nitrate saved');
	await expect(page.locator('li', { hasText: 'API Nitrate' }).first()).toContainText('6 min 30 s');

	// A kit of your own, with a 2-second wait so the test can see it end
	await page.locator('#add-name').fill('Quick pH');
	await page.locator('#add-param').selectOption('ph');
	await page.locator('#add-steps').fill('Add 3 drops\nWait 2 s\nRead the colour');
	await page.getByRole('button', { name: 'Add kit' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Quick pH saved');

	// On the form: Start, the countdown in the row, then time's up
	await open(page, `/entries/test/new?tank=${tankId}`);
	await expect(page.getByRole('button', { name: /Start API Nitrate, 6 min 30 s/ })).toBeVisible();
	await page.getByRole('button', { name: /Start Quick pH/ }).click();
	const steps = page.getByRole('list', { name: 'Quick pH steps' });
	await expect(steps.getByText('Add 3 drops')).toBeVisible();
	await steps.getByRole('button', { name: 'Next' }).click();
	await expect(steps.getByRole('timer')).toBeVisible();
	// the other readings can be typed meanwhile
	await page.getByLabel('Nitrate', { exact: true }).fill('10');
	await expect(steps.getByText("✓ Time's up")).toBeVisible({ timeout: 5000 });
	await expect(page.getByRole('status')).toContainText("⏱ pH: time's up");
	await steps.getByRole('button', { name: 'Next' }).click();
	await steps.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByText('✓ Done · type the reading above')).toBeVisible();
	await page.getByLabel('pH', { exact: true }).fill('7.0');
	await page.getByRole('button', { name: 'Save 2 readings' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
});
