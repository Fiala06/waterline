import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #203: an item tied to the Shelly plug it runs from (here the stand-in under
// /dev/shelly). Off at the plug, it's paused; Turn off and Turn on switch it.
test('a doser on a smart plug: linked, switched from Waterline, and followed when switched at the plug', async ({ page, request, baseURL }, info) => {
	await newKeeperWithTank(page, `plug-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const tag = `${info.project.name}-${Date.now()}`;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Other$/ }).click();
	await page.getByLabel('Brand').fill('Jebao');
	await page.getByLabel('Model').fill('Doser');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Jebao Doser added');

	// from the item's page: link a plug, which asks for its password
	await page.locator('a[href*="/equipment/"]').filter({ hasText: 'Jebao Doser' }).first().click();
	await page.getByRole('link', { name: 'Link a smart plug ›' }).click();
	await expect(page).toHaveURL(/\/plug$/);
	await page.getByLabel('Plug address').fill(`${baseURL}/dev/shelly/locked-${tag}`);
	await page.getByRole('button', { name: 'Link plug' }).click();
	await expect(page.getByRole('alert')).toContainText('The plug asks for its password');
	await page.getByLabel('Password · optional').fill('plug-pass');
	await page.getByRole('button', { name: 'Link plug' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Jebao Doser runs from PlugUSG4 · ● On · 3.1 W');
	await expect(page.getByText('· with its password')).toBeVisible();

	// another plug, without a password
	const plug = `${baseURL}/dev/shelly/open-${tag}`;
	await page.getByLabel('Plug address').fill(plug);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('● On · 3.1 W');

	// Turn off on its card switches the plug off, after a confirm
	await open(page, `/tanks/${tankId}/equipment`);
	await expect(page.locator('.eq-card .plug')).toContainText('● On · 3.1 W');
	await page.getByRole('button', { name: 'Turn off Jebao Doser' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByRole('status')).toContainText('‖ Jebao Doser turned off at its plug');
	await expect(page.locator('.eq-card')).toContainText('‖ Paused today');
	await expect(page.locator('.eq-card .plug')).toContainText('○ Off');
	expect((await (await request.get(`${plug}/rpc/Switch.GetStatus?id=0`)).json()).output).toBe(false);

	// the dashboard's Turn on switches it back on
	await open(page, `/?tank=${tankId}`);
	await expect(page.locator('section.attention')).toContainText('Jebao Doser');
	await page.getByRole('button', { name: 'Turn on Jebao Doser' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Turn on' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Jebao Doser turned back on at its plug');
	await expect(page.locator('section.attention')).toHaveCount(0);

	// switched off at the plug itself: the next read pauses it, and History says the plug did it
	await request.get(`${plug}/rpc/Switch.Set?id=0&on=false`);
	expect((await request.post('/dev/tick')).ok()).toBe(true);
	await open(page, `/?tank=${tankId}`);
	await expect(page.locator('section.attention')).toContainText('Jebao Doser');
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Paused Jebao Doser · its plug was switched off').first()).toBeVisible();
});

// #205: a doser that runs while it has power, on a plug with its schedule and
// auto-off in the Shelly app. The plug reports each run, logged as a dose.
test('a doser on a smart plug: Run for… logs a dose with how long, and Pause turns its schedule off', async ({ page, request, baseURL }, info) => {
	await newKeeperWithTank(page, `plug-doser-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const plug = `${baseURL}/dev/shelly/doser-${info.project.name}-${Date.now()}`;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Doser$/ }).click();
	await page.getByLabel('Brand').fill('BRS');
	await page.getByLabel('Model').fill('Pump');
	await page.getByLabel('Product', { exact: true }).fill('Thrive+');
	await page.getByLabel('Amount', { exact: true }).fill('3');
	await page.locator('#dose-0-at').fill('10:30');
	await page.getByLabel('Runs for').fill('30');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ BRS Pump added');

	await page.locator('a[href*="/equipment/"]').filter({ hasText: 'BRS Pump' }).first().click();
	await page.getByRole('link', { name: 'Link a smart plug ›' }).click();
	await page.getByLabel('Plug address').fill(plug);
	await page.getByRole('button', { name: 'Link plug' }).click();
	await expect(page.getByRole('status')).toContainText('✓ BRS Pump runs from PlugUSG4 · ○ Off');
	await expect(page.getByText('✓ The plug tells Waterline each time it switches')).toBeVisible();
	await expect(page.getByText('Switches itself off after 30 s')).toBeVisible();

	// off between doses: not paused, so nothing needs attention for it
	await open(page, `/?tank=${tankId}`);
	await expect(page.locator('section.attention')).toHaveCount(0);

	// Run for 2 seconds: the plug runs, switches itself off and reports it; the run is a dose
	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('button', { name: 'Run for… BRS Pump' }).click();
	const sheet = page.getByRole('dialog', { name: 'Run BRS Pump for…' });
	await sheet.getByLabel('How long').fill('2');
	await sheet.getByRole('button', { name: 'Run' }).click();
	await expect(page.getByRole('status')).toContainText('● BRS Pump running for 2 s');
	// 3 mL in 30 s: 0.2 mL in 2
	await expect(async () => {
		await open(page, `/history?tank=${tankId}`);
		await expect(page.getByText('Dosed Thrive+ · 0.2 mL · ran 2 s').first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
	await open(page, `/tanks/${tankId}/equipment`);
	await expect(page.locator('.eq-card', { hasText: 'BRS Pump' })).toContainText('Last ran');

	// Pause: its schedule on the plug goes off; Resume brings it back
	await page.getByRole('button', { name: 'Pause BRS Pump' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Pause' }).click();
	await expect(page.getByRole('status')).toContainText('‖ BRS Pump paused · its schedule on the plug is off');
	expect((await (await request.get(`${plug}/rpc/Schedule.List`)).json()).jobs[0].enable).toBe(false);
	await open(page, `/?tank=${tankId}`);
	await page.getByRole('button', { name: 'Resume BRS Pump' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Resume' }).click();
	await expect(page.getByRole('status')).toContainText('✓ BRS Pump resumed · its schedule on the plug is back on');
	expect((await (await request.get(`${plug}/rpc/Schedule.List`)).json()).jobs[0].enable).toBe(true);
});
