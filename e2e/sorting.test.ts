import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #79: a tank's lists sort by their columns (a menu on phones and for lists without them)
test('livestock sorts by its columns, and each visit starts in the default order', async ({ page }, info) => {
	await newKeeperWithTank(page, `sort-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, `/tanks/${tankId}/import/livestock`);
	await page.locator('input[type=file][name=file]').setInputFiles({
		name: 'fish.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('Name,Count\nOtocinclus,3\nNeon tetra,12\nAmano shrimp,6\n')
	});
	await page.getByRole('button', { name: /^Add 21 animals/ }).click();
	await expect(page.getByText('21 animals · 3 species', { exact: true })).toBeVisible();

	const names = () => page.locator('.tr .name').allInnerTexts();
	const phone = info.project.name === 'phone';
	// most animals first: a tap on Count (a computer), or Sort by (a phone)
	if (phone) await page.locator('#sort-by').selectOption('count:desc');
	else await page.getByRole('link', { name: /^Count/ }).click();
	await expect(page).toHaveURL(/sort=count&dir=desc/);
	await expect.poll(names).toEqual(['Neon tetra', 'Amano shrimp', 'Otocinclus']);
	if (!phone) {
		await expect(page.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'descending');
		// tapped again, the other way round
		await page.getByRole('link', { name: /^Count/ }).click();
		await expect.poll(names).toEqual(['Otocinclus', 'Amano shrimp', 'Neon tetra']);
		await expect(page.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'ascending');
	}
	// by name, from the address alone (no scripts needed)
	await open(page, `/tanks/${tankId}/livestock?sort=species&dir=asc`);
	await expect.poll(names).toEqual(['Amano shrimp', 'Neon tetra', 'Otocinclus']);

	// a new visit is in the default order again
	await open(page, `/tanks/${tankId}/livestock`);
	if (phone) await expect(page.locator('#sort-by')).toHaveValue('');
	else await expect(page.getByRole('columnheader', { name: /Count/ })).toHaveAttribute('aria-sort', 'none');
});
