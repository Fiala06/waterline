import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Tank-aware guidance (#90): the next step under a reading out of range is
// worded for the tank's water source and CO₂, and opens the calculator that
// does the sums, filled in.

test('the next step knows the tank is on RO water with CO₂, and opens the right calculator', async ({ page }, info) => {
	await newKeeperWithTank(page, `guidance-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// nothing set yet: the plain advice, and nitrate's water change calculator
	await open(page, `/entries/test/new?tank=${tankId}`);
	await page.getByLabel('Nitrate', { exact: true }).fill('40');
	await page.getByLabel('KH', { exact: true }).fill('1');
	await page.getByLabel('pH', { exact: true }).fill('5.8');
	await page.getByRole('button', { name: /^Save 3 readings/ }).click();
	await expect(page.getByRole('status')).toContainText('✓ Saved');
	const attention = page.getByRole('region', { name: 'Needs attention' });
	const item = (name: string) => attention.locator('.item', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
	await expect(item('KH')).toContainText('Low KH lets pH drop suddenly.');
	await expect(item('pH')).toContainText('Skip pH chemicals');
	const wcLink = item('Nitrate').getByRole('link', { name: /Work out the water change/ });
	await expect(wcLink).toHaveAttribute('href', `/calculators?tank=${tankId}&param=no3#water-change`);
	await wcLink.click();
	// the calculator opens on nitrate, from 40
	await expect(page.locator('#wc-p')).toHaveValue(/.+/);
	await expect(page.locator('#wc-p option:checked')).toHaveText(/^Nitrate/);
	await expect(page.locator('#wc-from')).toHaveValue('40');

	// Tank setup: RO water and a CO₂ schedule
	await open(page, `/tanks/${tankId}/settings`);
	await page.getByLabel('Water source').selectOption('rodi');
	await page.getByLabel('CO₂ on', { exact: true }).fill('07:00');
	await page.getByLabel('CO₂ off', { exact: true }).fill('15:00');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('status')).toContainText('✓');

	await open(page, `/?tank=${tankId}`);
	await expect(item('KH')).toContainText('Your new water is RO: add a little more KH remineralizer to it. With CO₂ injected, KH also decides how far pH drops');
	await expect(item('KH').getByRole('link', { name: /GH \/ KH for RO water/ })).toHaveAttribute('href', `/calculators?tank=${tankId}#remineralize`);
	await expect(item('pH')).toContainText('With CO₂ injected, pH drops while it runs');
	await expect(item('pH').getByRole('link', { name: /Estimate CO₂ from pH and KH/ })).toHaveAttribute('href', `/calculators?tank=${tankId}#co2`);
	// the reading's row still opens its chart
	await expect(item('KH').locator('a.row')).toHaveAttribute('href', /\/charts\?p=/);
});
