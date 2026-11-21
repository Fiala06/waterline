import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #317: some of a group moves from a quarantine tank to the display, confirmed, logged in both, never a loss
test('move some of a group to another tank, then the rest', async ({ page }, info) => {
	await newKeeperWithTank(page, `move-${info.project.name}`);
	const qtId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/tanks/new');
	await page.getByLabel('Tank name').fill('Display 200');
	await page.locator('label', { hasText: 'Freshwater' }).click();
	await page.getByLabel('Volume').fill('50');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Tank created');

	await open(page, `/tanks/${qtId}/livestock/new`);
	await page.getByLabel('Species').fill('Neon tetra');
	await page.keyboard.press('Escape');
	await page.getByLabel('Count', { exact: true }).fill('10');
	await page.getByRole('button', { name: 'Add' }).last().click();
	await expect(page.getByRole('status')).toContainText('✓ Added 10 Neon tetra');

	await page.getByRole('link', { name: 'Neon tetra', exact: true }).click();
	await page.getByText('Move to another tank').click();
	await page.getByLabel('To', { exact: true }).selectOption({ label: 'Display 200' });
	await page.getByLabel(/How many/).fill('4');
	await page.getByRole('button', { name: 'Move…' }).click();
	// said first, then done
	await expect(page.getByText(/Move 4 Neon tetra to Display 200\?/)).toBeVisible();
	await page.getByRole('button', { name: 'Move', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('✓ Moved 4 Neon tetra to Display 200');
	await expect(page.getByRole('heading', { name: /Neon tetra ×4/ })).toBeVisible();
	await expect(page.getByText('4 Neon tetra moved in from Riverbed 40')).toBeVisible();

	await open(page, `/history?tank=${qtId}&range=all`);
	await expect(page.locator('a.row', { hasText: 'Moved 4 Neon tetra to Display 200' })).toHaveCount(1);
	await expect(page.locator('a.row', { hasText: '· loss' })).toHaveCount(0);
	await open(page, `/tanks/${qtId}/livestock`);
	await expect(page.getByRole('link', { name: 'Neon tetra', exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Neon tetra', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Neon tetra ×6/ })).toBeVisible();

	// the rest: into the group there
	await page.getByText('Move to another tank').click();
	await page.getByRole('button', { name: 'Move…' }).click();
	await page.getByRole('button', { name: 'Move', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Neon tetra ×10/ })).toBeVisible();
	await open(page, `/tanks/${qtId}/livestock`);
	await expect(page.getByRole('link', { name: 'Neon tetra', exact: true })).toHaveCount(0);
});
