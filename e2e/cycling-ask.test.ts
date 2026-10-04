import { expect, test } from '@playwright/test';
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
	await expect(cycling).toContainText('add fish once ammonia and nitrite both read 0');
	await expect(page.getByRole('region', { name: 'Needs attention' })).toContainText('Ammonia ▲ Cycling');

	// and History says so
	await open(page, `/history?tank=${tankId}`);
	await expect(page.getByRole('link', { name: /^Marked as cycling/ })).toBeVisible();
});
