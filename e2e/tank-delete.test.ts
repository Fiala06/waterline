import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #304: an archived tank can be deleted for good by its owner, after its name is typed out
test('archive a tank, then delete it for good', async ({ page }, info) => {
	await newKeeperWithTank(page, `tank-delete-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// not archived: no way to delete it
	await open(page, `/tanks/${tankId}/settings`);
	await expect(page.getByRole('link', { name: 'Delete tank…' })).toHaveCount(0);
	expect((await page.request.get(`/tanks/${tankId}/delete`)).status()).toBe(400);
	await page.getByRole('button', { name: 'Archive tank' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
	await expect(page).toHaveURL(/\/tanks$/);

	// archived: Delete… beside Restore, and on its Settings tab
	await page.getByText(/^Archived · 1/).click();
	await page.getByRole('link', { name: 'Delete Riverbed 40…' }).click();
	await expect(page).toHaveURL(new RegExp(`/tanks/${tankId}/delete$`));
	await expect(page.getByRole('region', { name: "What's deleted" })).toContainText(/\d+ History entr/);
	await expect(page.getByRole('link', { name: 'Download a backup of this tank' })).toHaveAttribute('href', `/settings/export?tank=${tankId}`);

	// the name, exactly
	await page.getByLabel(/type the tank's name/).fill('Riverbed');
	await page.getByRole('button', { name: 'Delete tank for good' }).click();
	await expect(page.getByRole('alert')).toContainText('Type the tank’s name exactly as it is shown.');
	await page.getByLabel(/type the tank's name/).fill('Riverbed 40');
	await page.getByRole('button', { name: 'Delete tank for good' }).click();
	await expect(page).toHaveURL(/\/tanks$/);
	await expect(page.getByRole('status')).toContainText('Riverbed 40 deleted');
	await expect(page.getByText(/^Archived ·/)).toHaveCount(0);
	expect((await page.request.get(`/tanks/${tankId}`)).status()).toBe(404);
});
