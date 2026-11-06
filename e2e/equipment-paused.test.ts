import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Equipment switched off on purpose (a doser held back) sits in Needs attention
// on the dashboard until it's resumed, so it isn't forgotten.
test('A paused doser stays on the dashboard until it is resumed', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `eq-paused-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Other$/ }).click();
	await page.getByLabel('Brand').fill('Jebao');
	await page.getByLabel('Model').fill('Doser');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Jebao Doser added');

	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('button', { name: 'Pause Jebao Doser' }).click();
	await expect(page.getByRole('status')).toContainText('‖ Jebao Doser paused');
	await expect(page.locator('.eq-card')).toContainText('‖ Paused today');

	// the dashboard keeps it in Needs attention, with Resume
	await open(page, `/?tank=${tankId}`);
	const attention = page.locator('section.attention');
	await expect(attention).toContainText('Jebao Doser');
	await expect(attention).toContainText('‖ Paused');

	// without scripts too: Resume takes it off and comes back to the dashboard
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const p = await ctx.newPage();
	await p.goto(`/?tank=${tankId}`);
	await p.getByRole('button', { name: 'Resume Jebao Doser' }).click();
	await expect(p).toHaveURL(new RegExp(`/\\?tank=${tankId}`));
	await expect(p.locator('section.attention')).toHaveCount(0);
	await ctx.close();

	// History has both
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Paused Jebao Doser').first()).toBeVisible();
	await expect(page.getByText('Resumed Jebao Doser').first()).toBeVisible();
});

// #196: one dose of a doser paused on its own shows too, with Resume for that dose.
test('A paused dose of a doser is in Needs attention, with Resume', async ({ page }, info) => {
	await newKeeperWithTank(page, `dose-paused-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Doser$/ }).click();
	await page.getByLabel('Brand').fill('Kamoer');
	await page.getByLabel('Model').fill('X1');
	await page.getByLabel('Product', { exact: true }).fill('Thrive+');
	await page.getByLabel('Amount', { exact: true }).fill('1');
	await page.locator('#dose-0-at').fill('09:00');
	await page.getByLabel(/^Paused · nothing is logged/).check();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Kamoer X1 added');

	await open(page, `/?tank=${tankId}`);
	const attention = page.locator('section.attention');
	await expect(attention).toContainText('Kamoer X1 · Thrive+');
	await expect(attention).toContainText('Thrive+ 1 mL at 09:00 every day');
	await page.getByRole('button', { name: 'Resume Kamoer X1 · Thrive+' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Thrive+ on Kamoer X1 resumed');
	await expect(page.locator('section.attention')).toHaveCount(0);

	// the whole doser paused holds every dose back on its card
	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('button', { name: 'Pause Kamoer X1' }).click();
	await expect(page.locator('.eq-card')).toContainText('○ Paused');
});
