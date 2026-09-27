import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test("a tank's notes: pinned, then the latest dated ones, added from its page", async ({ page }) => {
	await newKeeperWithTank(page, 'notes');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const notes = page.locator('section[aria-labelledby="notes-h"]');

	await open(page, `/tanks/${tankId}`);
	await expect(notes.getByText("Dated notes about this tank, newest first. They're in History too.")).toBeVisible();

	// Add note comes back to the tank
	await notes.getByRole('link', { name: 'Add note' }).click();
	await page.locator('textarea#note').fill('Moved the tank to the living room');
	await page.getByRole('button', { name: 'Save note' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Note saved');
	await expect(page).toHaveURL(`/tanks/${tankId}`);
	await expect(notes.getByRole('link', { name: /Moved the tank to the living room/ })).toBeVisible();
	await expect(notes.getByRole('link', { name: 'All ›' })).toHaveAttribute('href', `/history?tank=${tankId}&cat=note&range=all`);

	// the tank's notes field is the pinned note
	await open(page, `/tanks/${tankId}/settings`);
	await page.locator('textarea#notes').fill('Aquasoil, CO₂ on a timer');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await open(page, `/tanks/${tankId}`);
	await expect(notes.locator('.pinned')).toContainText('Aquasoil, CO₂ on a timer');
});

test('remind me about this tank: a one-off task, from its page and the dashboard', async ({ page }) => {
	await newKeeperWithTank(page, 'remind');
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}`);
	await page.locator('section[aria-labelledby="notes-h"]').getByRole('link', { name: 'Remind me' }).click();
	const sheet = page.getByRole('dialog', { name: 'Remind me about Riverbed 40' });
	await sheet.getByLabel('Remind me to').fill('Check the new shrimp');
	await sheet.locator('label', { hasText: 'Tomorrow' }).click();
	await sheet.getByRole('button', { name: 'Set reminder' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Reminder set for');
	await expect(page).toHaveURL(`/tanks/${tankId}`);
	await expect(sheet).not.toBeVisible();

	// from the dashboard's Due, then both are in Tasks
	await open(page, `/?tank=${tankId}`);
	await page.getByRole('link', { name: 'Remind me' }).click();
	await page.getByRole('dialog', { name: 'Remind me about Riverbed 40' }).getByLabel('Remind me to').fill('Order more food');
	await page.getByRole('dialog', { name: 'Remind me about Riverbed 40' }).getByRole('button', { name: 'Set reminder' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Reminder set for');
	await open(page, '/tasks');
	await expect(page.getByText('Check the new shrimp').first()).toBeVisible();
	await expect(page.getByText('Order more food').first()).toBeVisible();
});

test('remind me works without scripts', async ({ page, browser }) => {
	await newKeeperWithTank(page, 'remind-plain');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto(`/tanks/${tankId}`);
	await plain.locator('section[aria-labelledby="notes-h"]').getByRole('link', { name: 'Remind me' }).click();
	await expect(plain).toHaveURL(new RegExp(`/tanks/${tankId}/remind\\?from=`));
	await plain.getByLabel('Remind me to').fill('Replace the filter pad');
	await plain.locator('label', { hasText: 'On a date' }).click();
	await plain.getByLabel('Date', { exact: true }).fill('2099-01-15');
	await plain.getByRole('button', { name: 'Set reminder' }).click();
	await expect(plain).toHaveURL(`/tanks/${tankId}`);
	await plain.goto('/tasks');
	await expect(plain.getByText('Replace the filter pad').first()).toBeVisible();
	await ctx.close();
});

test('a custom parameter from another tank, added again in one tap', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'the targets table is the same on phones; once is enough');
	await newKeeperWithTank(page, 'reuse');
	const first = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${first}/targets`);
	await page.getByRole('button', { name: '+ Add custom parameter' }).click();
	const sheet = page.getByRole('dialog', { name: 'Custom parameter' });
	await sheet.getByLabel('Name').fill('Strontium');
	await sheet.locator('input[name=min]').fill('8');
	await sheet.locator('input[name=max]').fill('12');
	await sheet.getByRole('button', { name: /^Add to / }).click();
	await expect(page.getByRole('status')).toContainText('✓ Strontium added');

	// a second tank offers it
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Reef 24');
	await page.locator('label', { hasText: 'Reef' }).click();
	await page.getByLabel('Volume').fill('24');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank created');
	const second = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${second}/targets`);
	await page.getByRole('button', { name: '+ Add custom parameter' }).click();
	await expect(sheet.getByText('From your other tanks')).toBeVisible();
	await sheet.getByRole('button', { name: 'Add Strontium to Reef 24' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Strontium added');
	await expect(page.getByLabel('Strontium minimum')).toHaveValue('8');
	await expect(page.getByLabel('Strontium maximum')).toHaveValue('12');

	// once it's there, it's not offered again
	await expect(sheet.getByText('From your other tanks')).toHaveCount(0);
});
