import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open, openQuickAdd } from './helpers';

// #85 a plant's health journal, #86 algae on the tank: both observations, in
// History; the plant's status follows its latest entry.
test('a plant keeps a health journal, and algae is logged on the tank', async ({ page }, info) => {
	await newKeeperWithTank(page, `plant-health-${info.project.name}`); // planted
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// a plant, via Log event (linked)
	await open(page, `/entries/event/new?tank=${tankId}&category=livestock`);
	await page.locator('label', { hasText: /^Plant$/ }).click();
	await page.getByLabel('Species').pressSequentially('Red stem bunch', { delay: 20 });
	await page.getByRole('button', { name: 'Save change' }).click();
	await expect(page.getByRole('status')).toContainText('added to Plants');

	// Health from the Plants header on a computer, from the plant's sheet on a phone: pinholes on it
	await open(page, `${base}/plants`);
	await expect(page.getByText('✓ Thriving')).toBeVisible();
	if (info.project.name === 'phone') {
		await page.getByRole('button', { name: /Red stem bunch/ }).first().click();
		await page.locator('dialog[open]').getByRole('link', { name: 'Log health ›' }).click();
	} else {
		await page.getByRole('link', { name: 'Health', exact: true }).click();
	}
	await expect(page).toHaveURL(new RegExp(`${base}/plants/health`));
	await expect(page.getByRole('checkbox', { name: /Red stem bunch/ })).toBeChecked(); // the only plant is ticked
	await page.locator('label.chip', { hasText: 'Pinholes' }).click();
	await page.getByLabel('Note · optional').fill('Older leaves only');
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Plant health logged · Red stem bunch');
	await expect(page).toHaveURL(new RegExp(`${base}/plants`));
	await expect(page.getByText('▲ Melting')).toBeVisible();

	// the plant's sheet shows its journal
	await page.getByRole('button', { name: /Red stem bunch/ }).first().click();
	const sheet = page.locator('dialog[open]');
	await expect(sheet.getByRole('region', { name: 'Health' })).toContainText('▲ Pinholes');
	await expect(sheet.getByRole('region', { name: 'Health' })).toContainText('Older leaves only');
	await expect(sheet.getByRole('link', { name: 'Log health ›' })).toHaveAttribute('href', new RegExp(`${base}/plants/health\\?plant=`));
	await page.keyboard.press('Escape');

	// algae, from the Plants header on a computer, from Quick add on a phone
	if (info.project.name === 'phone') {
		await openQuickAdd(page);
		await page.getByRole('dialog', { name: 'Quick add' }).getByRole('link', { name: 'Algae' }).click();
	} else {
		await page.getByRole('link', { name: 'Algae', exact: true }).click();
	}
	await expect(page).toHaveURL(new RegExp(`${base}/algae`));
	await page.locator('label.chip', { hasText: 'Black beard' }).click();
	await page.locator('label', { hasText: '▲ Some' }).click();
	await page.getByLabel('Where · optional').fill('driftwood');
	await page.getByRole('button', { name: 'Save', exact: true }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Algae logged');

	// both in History, under Observations
	await open(page, '/history');
	await expect(page.getByText('Red stem bunch · pinholes')).toBeVisible();
	await expect(page.getByText('Algae · Black beard · some · on driftwood')).toBeVisible();
});

// #174: algae starts a treatment course, which shows where it stands, links back, and ends early with Undo
test('algae starts a treatment course', async ({ page }, info) => {
	await newKeeperWithTank(page, `algae-course-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/algae`);
	await page.locator('label.chip', { hasText: 'Hair / thread' }).click();
	await page.getByRole('button', { name: 'Save and start a treatment course' }).click();
	await expect(page).toHaveURL(/\/tasks\/new\?/);
	await expect(page.getByRole('textbox', { name: 'Task' })).toHaveValue('Treat hair / thread algae');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Treat hair / thread algae added');
	const row = page.locator('a.rtext', { hasText: 'Treat hair / thread algae' });
	await expect(row).toContainText('Day 1 of 15');

	// the entry links to it
	await open(page, `/history?tank=${tankId}`);
	await page.getByRole('link', { name: /^Algae · Hair \/ thread/ }).first().click();
	await page.getByRole('link', { name: /Treat hair \/ thread algae · Day 1 of 15/ }).click();
	await expect(page).toHaveURL(/\/tasks\/[\w-]+$/);

	// End early, then Undo
	await page.getByRole('button', { name: 'End early' }).click();
	await expect(page.getByRole('status')).toContainText('Course ended early');
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status')).toContainText('Undid Treat hair / thread algae');
	await open(page, '/tasks');
	await expect(page.locator('a.rtext', { hasText: 'Treat hair / thread algae' })).toBeVisible();
});
