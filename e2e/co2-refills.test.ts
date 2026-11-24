import { expect, test } from './test';
import { dateValue, newKeeperWithTank, open, pickDate } from './helpers';

// #368: a CO₂ cylinder's refills are logged on the item, each a History entry;
// from the second one Waterline says how long a fill lasts, and, when asked,
// alerts when the cylinder is likely running low, until the next refill.
test('Refills of a CO₂ cylinder say how long a fill lasts and when it is running low', async ({ page }, info) => {
	await newKeeperWithTank(page, `co2-refills-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^CO₂$/ }).click();
	await page.getByLabel('Brand').fill('FZone');
	await page.getByLabel('Model').fill('Pro');
	await page.getByLabel('Cylinder').fill('2.5 lb');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ FZone Pro added');

	// from its card on the Equipment tab
	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('link', { name: 'Log refill' }).click();
	await expect(page).toHaveURL(/\/refills$/);
	await page.locator('html[data-ready="true"]').waitFor();
	await expect(page.locator('.lede')).toHaveText('FZone Pro · 2.5 lb cylinder');
	await expect(page.getByText('No refill logged yet.')).toBeVisible();

	const today = await dateValue(page, 'day');
	const ago = (days: number) => new Date(Date.parse(today + 'T12:00:00Z') - days * 86_400_000).toISOString().slice(0, 10);

	// ten days ago, with what it cost
	await pickDate(page, 'day', ago(10));
	await page.getByLabel('Cost · optional').fill('22.50');
	await page.getByLabel('Note · optional').fill('Welding supply');
	await page.getByRole('button', { name: 'Log refill' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Refill logged · its cost is in Spending');
	await expect(page.getByText('Log the next refill too')).toBeVisible();

	// the same day again is turned down
	await pickDate(page, 'day', ago(10));
	await page.getByRole('button', { name: 'Log refill' }).click();
	await expect(page.getByRole('alert')).toContainText('A refill is already logged for that day.');

	// five days ago: a fill lasted 5 days, so today it's likely running low
	await pickDate(page, 'day', ago(5));
	await page.getByRole('button', { name: 'Log refill' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Refill logged');
	const cylinder = page.locator('section', { has: page.getByRole('heading', { name: 'Cylinder', exact: true }) });
	await expect(cylinder).toContainText('The last fill lasted about 5 days', { ignoreCase: true });
	await expect(cylinder).toContainText('▲ Likely running low');
	await expect(page.getByRole('heading', { name: 'Refills · 2' })).toBeVisible();
	await expect(page.locator('.refill').first()).toContainText('the fill before lasted about 5 days');
	await expect(page.locator('.refill').last()).toContainText('Welding supply');

	// no alert until it's asked for
	await open(page, '/alerts');
	await expect(page.getByText('cylinder likely running low')).toHaveCount(0);
	await open(page, `/tanks/${tankId}/equipment`);
	const card = page.locator('.eq-card');
	await expect(card).toContainText('▲ Likely running low');
	await expect(card).toContainText('Last refilled');
	await card.getByRole('link', { name: 'Log refill' }).click();
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByLabel('Tell me under Alerts when the cylinder is likely running low').check();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status')).toContainText('✓ You’ll be alerted');
	await open(page, '/alerts');
	await expect(page.getByText('FZone Pro: cylinder likely running low')).toBeVisible();
	await page.getByRole('link', { name: 'Refills', exact: true }).click();
	await expect(page).toHaveURL(/\/refills$/);
	await page.locator('html[data-ready="true"]').waitFor();

	// refilled today: quiet again
	await page.getByRole('button', { name: 'Log refill' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Refill logged');
	await expect(cylinder).toContainText('✓ Next refill around');
	await expect(cylinder).toContainText('A fill lasts about 5 days (average of 2)', { ignoreCase: true });
	await open(page, '/alerts');
	await expect(page.getByText('cylinder likely running low')).toHaveCount(0);

	// History has each refill, Spending its cost, and the item's page the cylinder
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByText('Refilled FZone Pro').first()).toBeVisible();
	await open(page, `/tanks/${tankId}/spending`);
	await expect(page.getByText('CO₂ refill').first()).toBeVisible();
	await open(page, `/tanks/${tankId}/equipment`);
	await card.getByRole('link', { name: 'Details' }).click();
	await expect(page.getByText('Refills · log a refill ›')).toBeVisible();
});

// without scripts the form still logs a refill
test('A refill can be logged without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `co2-nojs-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^CO₂$/ }).click();
	await page.getByLabel('Brand').fill('FZone');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('added');

	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const p = await ctx.newPage();
	await p.goto(`/tanks/${tankId}/equipment`);
	await p.getByRole('link', { name: 'Log refill' }).click();
	await p.getByRole('button', { name: 'Log refill' }).click();
	await expect(p).toHaveURL(/\/refills$/);
	await expect(p.getByRole('heading', { name: 'Refills · 1' })).toBeVisible();
	await ctx.close();
});
