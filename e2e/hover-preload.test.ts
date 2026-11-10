import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Passing the mouse over a link fetches its data ahead; that must not change
// which tank is the current one (#223). Only really going there does.
test('hovering another tank in the sidebar leaves the current tank as it is', async ({ page }, info) => {
	test.skip(info.project.name === 'phone', 'the sidebar, and a mouse to hover with, are on a computer');
	await newKeeperWithTank(page, `hover-${info.project.name}`);
	const first = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Shrimp 10');
	await page.locator('label', { hasText: 'Freshwater' }).click();
	await page.getByLabel('Volume').fill('10');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank created');
	const second = new URL(page.url()).searchParams.get('tank')!;
	expect(second).not.toBe(first);
	/** The tank a page that names none works on: /tanks/current/… goes to it. */
	const currentTank = async () => {
		await page.goto('/tanks/current/equipment');
		return new URL(page.url()).pathname.split('/')[2];
	};

	// on the first tank, the mouse passes over the second: its data is fetched ahead, and nothing more
	await open(page, `/?tank=${first}`);
	const sidebar = page.locator('.tank-list');
	const fetched = page.waitForResponse((r) => r.url().includes('__data.json') && r.url().includes(second));
	await sidebar.getByRole('link', { name: /Shrimp 10/ }).hover();
	expect((await fetched).headers()['set-cookie'] ?? '').not.toContain('wl_tank');
	expect(await currentTank()).toBe(first);

	// clicking it is a visit: the app remembers it without a full page load
	await open(page, `/?tank=${first}`);
	await sidebar.getByRole('link', { name: /Shrimp 10/ }).click();
	await expect(page).toHaveURL(new RegExp(`tank=${second}`));
	expect(await currentTank()).toBe(second);

	// and so is opening a tank's page outright, with or without scripts
	await page.goto(`/?tank=${first}`);
	expect(await currentTank()).toBe(first);
});
