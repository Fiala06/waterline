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
