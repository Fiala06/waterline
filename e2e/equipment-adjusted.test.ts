import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// An adjustment to equipment says what changed: in History's title and on the
// entry's rows, before → after. It used to say only "Adjusted".
test('History says what an equipment adjustment changed', async ({ page }, info) => {
	await newKeeperWithTank(page, `adjusted-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/tanks/${tankId}/equipment/new`);
	await page.locator('label', { hasText: /^Light$/ }).click();
	await page.getByLabel('Brand').fill('Twinstar');
	await page.getByLabel('Model').fill('300S V');
	await page.getByLabel('Intensity').fill('60');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Twinstar 300S V added');

	// turn it up, and rename the model while at it
	await page.locator('a[href*="/equipment/"]').filter({ hasText: 'Twinstar 300S V' }).first().click();
	await expect(page).toHaveURL(/\/equipment\/[^/]+$/);
	await page.getByLabel('Intensity').fill('80');
	await page.getByLabel('Model').fill('300S VI');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toBeVisible();

	await open(page, `/history?tank=${tankId}`);
	const entry = page.getByRole('link', { name: /Adjusted Twinstar 300S VI · Intensity 60% → 80%, Model 300S V → 300S VI/ }).first();
	await expect(entry).toBeVisible();
	await entry.click();
	// the entry's rows, on the desktop pane or the phone's page: each setting before → after
	await expect(page.getByText('Intensity', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('60% → 80%', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('300S V → 300S VI', { exact: true }).first()).toBeVisible();
});
