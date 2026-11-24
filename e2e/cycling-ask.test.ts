import { expect, test } from './test';
import { newKeeperWithTank, open } from './helpers';

// #68: a new tank with high ammonia that isn't marked cycling asks whether it is
test('a new tank with high ammonia asks if it is cycling', async ({ page }, info) => {
	await newKeeperWithTank(page, `ask-cycling-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Ammonia', { exact: true }).fill('1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	const ask = page.getByRole('region', { name: /New tank\? High ammonia or nitrite is normal/ });
	await expect(ask).toBeVisible();
	await ask.getByRole('button', { name: 'Mark as cycling' }).click();

	await expect(page.getByRole('status')).toContainText('✓ Riverbed 40 is cycling');
	await expect(ask).toHaveCount(0);
	const cycling = page.getByRole('region', { name: 'Cycling' });
	// what was measured, never when to add fish (#309)
	await expect(cycling).toContainText('they can’t say on their own when the tank is ready for fish');
	await expect(cycling).toContainText('Ammonia is rising: the first stage.');
	await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('Ammonia ▲ Cycling');

	// and History says so
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Marked as cycling/ })).toBeVisible();
});

// #155: an established tank with a one-off spike says Not cycling, and isn't asked again
test('Not cycling dismisses the ask for good', async ({ page }, info) => {
	await newKeeperWithTank(page, `not-cycling-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Ammonia', { exact: true }).fill('1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');

	const ask = page.getByRole('region', { name: /New tank\? High ammonia or nitrite is normal/ });
	await expect(ask).toBeVisible();
	await ask.getByRole('button', { name: 'Not cycling' }).click();
	await expect(page.getByRole('status')).toContainText("✓ Riverbed 40 isn't cycling");
	await expect(ask).toHaveCount(0);
	// still high, still not asked; and the tank isn't marked cycling
	await open(page, `/?tank=${tankId}`);
	await expect(ask).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Cycling' })).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('Ammonia');
	await expect(page.getByRole('region', { name: 'Needs attention' })).not.toContainText('▲ Cycling');
});

// #309: zeros say what was measured, and those from before a restart don't count
test('zero readings never say a tank is cycled, and a restart starts afresh', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'cycle-restart');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('This tank is still cycling').check();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toBeVisible();
	for (let i = 0; i < 3; i++) {
		await open(page, `/entries/test/new?tank=${tankId}`);
		await page.getByLabel('Ammonia', { exact: true }).fill('0');
		await page.getByLabel('Nitrite', { exact: true }).fill('0');
		await page.getByRole('button', { name: 'Save 2 readings' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Saved 2 readings');
	}
	const cycling = page.getByRole('region', { name: 'Cycling' });
	await expect(cycling).toContainText('Ammonia and nitrite read 0 on the last 3 tests');
	await expect(cycling).toContainText("Neither has shown up in this cycle yet, so the readings can't show the bacteria at work.");
	await expect(cycling).not.toContainText("it's cycled");

	// marked running, then cycling again: the earlier zeros aren't this cycle's
	await cycling.getByRole('button', { name: 'Mark as running' }).click();
	await expect(cycling).toHaveCount(0);
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('This tank is still cycling').check();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toBeVisible();
	await open(page, `/?tank=${tankId}`);
	await expect(cycling).toContainText('Log ammonia, nitrite and nitrate with each test to follow the cycle.');

	// #333: the same restart from Tank setup alone, unticked and ticked again, is in History and starts afresh
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Ammonia', { exact: true }).fill('0');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await expect(cycling).not.toContainText('Log ammonia, nitrite and nitrate with each test');
	for (const tick of [false, true]) {
		await open(page, `/tanks/${tankId}/settings`);
		await page.getByLabel('This tank is still cycling').setChecked(tick);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByRole('status')).toBeVisible();
	}
	await open(page, `/?tank=${tankId}`);
	await expect(cycling).toContainText('Log ammonia, nitrite and nitrate with each test to follow the cycle.');
	await open(page, '/history');
	await expect(page.getByText('Cycle complete').first()).toBeVisible();
});

// #309: with livestock already in a cycling tank, high ammonia stays ✕ High
test('a cycling tank with livestock in it keeps ammonia a warning', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one size is enough');
	await newKeeperWithTank(page, 'cycle-stocked');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/livestock/new`);
	await page.getByLabel('Species').fill('Otocinclus');
	await page.keyboard.press('Escape');
	await page.getByLabel('Count', { exact: true }).fill('3');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 3 Otocinclus');
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('This tank is still cycling').check();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toBeVisible();
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Ammonia', { exact: true }).fill('1');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved 1 reading');
	await expect(page.getByRole('region', { name: 'Cycling' })).toContainText('With livestock in the tank, ammonia or nitrite above 0 can harm them.');
	const attention = page.getByRole('region', { name: 'Needs attention' });
	await expect(attention).toContainText('Ammonia');
	await expect(attention).not.toContainText('▲ Cycling');
});
