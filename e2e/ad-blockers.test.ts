import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, openQuickAdd } from './helpers';

// Paths that ad blockers' privacy lists block on every site. EasyPrivacy (on by
// default in uBlock Origin) blocks "/log/event?" and about 40 more /log/ paths,
// which once stopped every event from saving.
const TRACKER_PATHS = /\/log\/|\/(track|tracking|collect|beacon|pixel|analytics|telemetry|metrics)([/?.]|$)|\/events?\?/i;

test('logging works with an ad blocker', async ({ page }, info) => {
	await newKeeperWithTank(page, `adblock-${info.project.name}`);
	const blocked: string[] = [];
	await page.route(TRACKER_PATHS, (route) => {
		blocked.push(route.request().url());
		return route.abort('blockedbyclient');
	});
	// the phone's Log button lists every kind; on a computer tests and water changes are under Log water test ▾
	const quickAdd = async (choice: RegExp) => {
		const log = page.getByRole('button', { name: 'Log', exact: true });
		if (!(await log.isVisible()) && /water test/i.test(choice.source)) return page.getByRole('link', { name: /^Log water test/ }).click();
		if (!(await log.isVisible()) && /water change/i.test(choice.source)) {
			await page.getByRole('button', { name: 'Other log types' }).click();
			return page.getByRole('menuitem', { name: 'Log water change' }).click();
		}
		await openQuickAdd(page);
		await page.getByRole('dialog', { name: 'Quick add' }).getByRole('link', { name: choice }).click();
	};

	// As reported: Quick add → Livestock / plants → 4 Amano shrimp
	await quickAdd(/^Livestock \/ plants$/);
	await page.locator('label', { hasText: /^Invert$/ }).click();
	await page.getByLabel('Species').pressSequentially('amano', { delay: 20 });
	await page.getByRole('option', { name: /Amano shrimp/ }).first().click();
	await page.getByLabel('Count', { exact: true }).fill('4');
	await page.getByRole('button', { name: 'Save change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Added 4 Amano shrimp');

	await quickAdd(/water change/i);
	await page.getByRole('button', { name: 'Save water change' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Water change logged');

	await quickAdd(/water test/i);
	await page.getByLabel('Nitrate', { exact: true }).fill('10');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	expect(blocked).toEqual([]);
});

test('old log form links still work', async ({ page }, info) => {
	await newKeeperWithTank(page, `oldlinks-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/log/test?tank=${tankId}`);
	await expect(page).toHaveURL(`/entries/test/new?tank=${tankId}`);
	await expect(page.getByRole('heading', { name: 'Water test' })).toBeVisible();
	await open(page, `/log/event?tank=${tankId}&category=note`);
	await expect(page).toHaveURL(`/entries/event/new?tank=${tankId}&category=note`);

	// A page still running the previous version posts to the old address.
	const type = await page.evaluate(async (tank) => {
		const body = new FormData();
		body.set('note', 'Posted to the old address');
		const res = await fetch(`/log/event?tank=${tank}&category=note`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
		return (await res.json()).type;
	}, tankId);
	expect(type).toBe('redirect');
	await open(page, `/?tank=${tankId}`);
	await expect(page.getByText('Posted to the old address')).toBeVisible();
});
