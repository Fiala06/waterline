import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #25: a schedule on a light (with a siesta) sets the tank's photoperiod, draws the day and is kept in History.
test('equipment schedules and the day timeline', async ({ page }, info) => {
	await newKeeperWithTank(page, `sched-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const base = `/tanks/${tankId}`;

	// A light on a schedule with a midday siesta and a 30-minute ramp
	await open(page, `${base}/equipment/new`);
	await page.locator('label', { hasText: /^Light$/ }).click();
	await page.getByLabel('Brand').fill('Lumora');
	await page.getByLabel('Model').fill('Pro 90');
	await page.locator('label', { hasText: 'On a schedule' }).click();
	await page.getByLabel('Period 1 on').fill('08:00');
	await page.getByLabel('Period 1 off').fill('12:00');
	await page.getByRole('button', { name: /Add a period/ }).click();
	await page.getByLabel('Period 2 on').fill('14:00');
	await page.getByLabel('Period 2 off').fill('18:00');
	await page.getByLabel('Ramp up and down').selectOption('30');
	await expect(page.getByText('Photoperiod 8 h a day')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Lumora Pro 90 added');

	// The Equipment tab: the day timeline, and the schedule on the card
	await expect(page.getByRole('heading', { name: 'The day' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'When each item runs through the day' })).toBeVisible();
	await expect(page.getByText('08:00–12:00, 14:00–18:00 · 8 h · ramps 30 min')).toBeVisible();
	await expect(page.getByText(/^(● On now|○ Off)/)).toBeVisible();

	// Tank details: the lights' times come from the light, and the photoperiod is the 8 h it runs
	await open(page, `${base}/settings`);
	await expect(page.getByText('08:00–12:00, 14:00–18:00 · 8 h')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Set on Lumora Pro 90 ›' })).toBeVisible();
	await expect(page.locator('#photoperiodH')).toHaveValue('8');

	// Change the schedule: History gets its own entry
	await page.getByRole('link', { name: 'Set on Lumora Pro 90 ›' }).click();
	await page.getByLabel('Period 2 off').fill('17:00');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Equipment saved');
	await open(page, '/history');
	await expect(page.getByText('Lumora Pro 90 runs 08:00–12:00, 14:00–17:00 · 7 h · ramps 30 min').first()).toBeVisible();

	// A pump that runs at night only, across midnight
	await open(page, `${base}/equipment/new`);
	await page.locator('label', { hasText: /^Pump$/ }).click();
	await page.getByLabel('Brand').fill('Wavemaker');
	await page.locator('label', { hasText: 'On a schedule' }).click();
	await page.getByLabel('Period 1 on').fill('22:00');
	await page.getByLabel('Period 1 off').fill('06:00');
	await expect(page.getByText('Runs 8 h a day.')).toBeVisible();
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByText('22:00–06:00 · 8 h')).toBeVisible();
});

// #25: PAR readings on a reef tank, as a map and a list.
test('PAR readings on a reef tank', async ({ page }, info) => {
	await newKeeperWithTank(page, `par-${info.project.name}`, 'Reef');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/equipment`);
	await expect(page.getByRole('heading', { name: 'Light over the tank · PAR' })).toBeVisible();
	await page.getByLabel('Where').selectOption('Back centre');
	await page.getByLabel('PAR', { exact: true }).fill('320');
	await page.getByLabel('Spot name · optional').fill('Acro ledge');
	await page.getByRole('button', { name: 'Add reading' }).click();
	await expect(page.getByRole('status')).toContainText('✓ PAR 320 at Acro ledge');
	await expect(page.locator('.dot b')).toHaveText('320');
	await expect(page.getByText('Intense · high-light SPS, clams')).toBeVisible();
	await page.getByLabel('PAR', { exact: true }).fill('90');
	await page.getByLabel('Where').selectOption('Front left');
	await page.getByRole('button', { name: 'Add reading' }).click();
	await expect(page.locator('.dot')).toHaveCount(2);
	await open(page, '/history');
	await expect(page.getByText('PAR 320 at Acro ledge').first()).toBeVisible();
	await open(page, `/tanks/${tankId}/equipment`);
	await page.getByRole('button', { name: /Delete the reading at Front left/ }).click();
	await expect(page.locator('.dot')).toHaveCount(1);
});
