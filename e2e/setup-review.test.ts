import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, pickDate } from './helpers';

// The setup review (#30): every few months, check the tank's settings are still right.

test('the setup review: from Tasks, part by part, fixing what changed, then All still right', async ({ page }, info) => {
	await newKeeperWithTank(page, `rv-${info.project.name}`);

	// every tank has one, every 3 months; its button opens the review instead of marking it done
	await open(page, '/tasks');
	await expect(page.getByText('Review tank setup', { exact: true }).filter({ visible: true })).toBeVisible();
	await expect(page.getByText(/every 3 months/i).filter({ visible: true }).first()).toBeVisible();
	await page.getByRole('button', { name: 'Review tank setup', exact: true }).click();
	await expect(page).toHaveURL(/\/tanks\/[^/]+\/review$/);
	const reviewUrl = new URL(page.url()).pathname;
	const tankUrl = reviewUrl.replace(/\/review$/, '');

	for (const part of ['Tank details', 'Equipment', 'Target ranges', 'Livestock & plants']) {
		await expect(page.getByRole('heading', { name: part })).toBeVisible();
	}
	await expect(page.getByText('– Not checked yet')).toHaveCount(4);
	await expect(page.getByText('Not reviewed yet.')).toBeVisible();

	// ✓ Still right on one part
	await page.getByRole('button', { name: 'Equipment still right' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Equipment still right');
	await expect(page.locator('#equipment').getByText(/✓ Checked/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Equipment still right' })).toHaveCount(0);

	// the light timer moved: Edit, save, and back on the review with the details checked
	await page.getByRole('link', { name: 'Edit tank details' }).click();
	await expect(page).toHaveURL(/\/settings\?from=review$/);
	await page.getByLabel(/Photoperiod/).fill('7');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(new RegExp(`${reviewUrl}(#details)?$`));
	await expect(page.locator('#details').getByText('7 h')).toBeVisible();
	await expect(page.locator('#details').getByText(/✓ Checked/)).toBeVisible();

	// target ranges the same way
	await page.getByRole('link', { name: 'Edit target ranges' }).click();
	await page.getByRole('button', { name: 'Save targets' }).click();
	await expect(page).toHaveURL(new RegExp(`${reviewUrl}(#targets)?$`));
	await expect(page.locator('#targets').getByText(/✓ Checked/)).toBeVisible();
	await expect(page.getByText('The part not checked yet counts as checked.')).toBeVisible();

	// All still right: done, with Undo; then again, and it's in History
	await page.getByRole('button', { name: 'All still right' }).click();
	const toast = page.getByRole('status');
	await expect(toast).toContainText('✓ Riverbed 40 reviewed · next');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Review tank setup');
	await open(page, reviewUrl);
	await expect(page.getByText('Not reviewed yet.')).toBeVisible();
	await page.getByRole('button', { name: 'All still right' }).click();
	await expect(page.getByRole('status')).toContainText('reviewed');
	await open(page, '/history');
	await expect(page.getByText('Reviewed tank setup · all still right').first()).toBeVisible();
	// a new round starts: each part was last checked today, ready for next time
	await open(page, reviewUrl);
	await expect(page.getByText(/^Last reviewed /)).toBeVisible();
	await expect(page.getByText(/– Last checked /)).toHaveCount(4);
	await expect(page.getByRole('button', { name: /^(Tank details|Equipment|Target ranges|Livestock & plants) still right$/ })).toHaveCount(4);

	// Tank settings: how often, or off
	await open(page, `${tankUrl}/settings`);
	await page.getByLabel('Setup review').selectOption('30');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank saved');
	await expect(page.getByLabel('Setup review')).toHaveValue('30');
	await open(page, '/tasks');
	await expect(page.getByText(/every month/i).filter({ visible: true }).first()).toBeVisible();
	await open(page, `${tankUrl}/settings`);
	await page.getByLabel('Setup review').selectOption('off');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByLabel('Setup review')).toHaveValue('off');
	await open(page, '/tasks');
	await expect(page.getByText('Review tank setup', { exact: true })).toHaveCount(0);
	await open(page, reviewUrl);
	await expect(page.getByText(/won't come up on its own/)).toBeVisible();
});

test('equipment on the review: a filter due a service, Serviced today', async ({ page }, info) => {
	await newKeeperWithTank(page, `rve-${info.project.name}`);
	await open(page, '/tasks');
	await page.getByRole('button', { name: 'Review tank setup', exact: true }).click();
	await expect(page).toHaveURL(/\/review$/);
	const reviewUrl = new URL(page.url()).pathname;
	const tankUrl = reviewUrl.replace(/\/review$/, '');

	// a filter put in a year ago, never serviced
	await open(page, `${tankUrl}/equipment/new`);
	await page.locator('label', { hasText: /^Filter$/ }).click();
	await page.getByLabel('Brand').fill('Tidewell');
	await page.getByLabel('Model').fill('C-400');
	await pickDate(page, 'installedAt', new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 10));
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toBeVisible();

	await open(page, reviewUrl);
	const filter = page.locator('#equipment li', { hasText: 'Tidewell C-400' });
	await expect(filter.getByText('▲ No service logged')).toBeVisible();
	await filter.getByRole('button', { name: 'Tidewell C-400 serviced today' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tidewell C-400 serviced today');
	await expect(filter.getByText('▲ No service logged')).toHaveCount(0);
	await expect(filter.locator('.it-meta')).toContainText('Serviced ');
	// the equipment counts as changed since the tank was set up
	await expect(page.locator('#equipment').getByText('Changed since the tank was added: see History.')).toBeVisible();
	await page.getByRole('button', { name: 'All still right' }).click();
	await open(page, '/history');
	await expect(page.getByText('Serviced Tidewell C-400').first()).toBeVisible();
	await expect(page.getByText('Reviewed tank setup · equipment changed').first()).toBeVisible();
});

test('a review that is due: Review on the dashboard opens it', async ({ page }, info) => {
	await newKeeperWithTank(page, `rvd-${info.project.name}`);
	// bring it forward to today in Tasks
	await open(page, '/tasks');
	const href = await page.locator('a', { hasText: 'Review tank setup' }).first().getAttribute('href');
	await open(page, href!);
	await expect(page.getByText(/every 13 weeks|every 3 months/i).first()).toBeVisible();
	await pickDate(page, 'nextDue', new Date().toISOString().slice(0, 10));
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Task saved');

	await open(page, '/');
	const row = page.locator('.row', { hasText: 'Review tank setup' });
	await expect(row).toBeVisible();
	await expect(row.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
	await row.getByRole('button', { name: 'Review' }).click();
	await expect(page).toHaveURL(/\/review$/);
	await expect(page.getByRole('heading', { name: 'Tank details' })).toBeVisible();
});

test('the setup review works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `rvn-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const p = await ctx.newPage();
	// Review from Tasks is a form: it lands on the review page
	await p.goto('/tasks');
	await p.getByRole('button', { name: 'Review tank setup', exact: true }).click();
	await expect(p).toHaveURL(/\/review$/);
	await p.getByRole('button', { name: 'Livestock & plants still right' }).click();
	await expect(p.locator('#livestock').getByText(/✓ Checked/)).toBeVisible();
	await p.getByRole('button', { name: 'All still right' }).click();
	await expect(p).not.toHaveURL(/\/review$/);
	await p.goto(new URL(p.url()).pathname + '/review');
	await expect(p.getByText(/^Last reviewed /)).toBeVisible();
	await ctx.close();
});
