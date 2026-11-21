import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #314: Spending's filters work together, say what they show apart from the headline totals, and download as a CSV
test('filter spending by words, category and dates, and download it as a CSV', async ({ page }, info) => {
	await newKeeperWithTank(page, `spend-filter-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const add = async (amount: string, what: string, category: string) => {
		await open(page, `/tanks/${tankId}/spending/new`);
		await page.getByLabel('Amount').fill(amount);
		await page.getByLabel('What for').fill(what);
		await page.locator('label', { hasText: category }).click();
		await page.getByRole('button', { name: 'Add expense' }).click();
		await expect(page.getByRole('status')).toContainText('✓ Expense added');
	};
	await add('39.99', 'Jäger heater', 'Equipment');
	await add('5', 'Heater suction cups', 'Other');
	await add('12', 'Java moss', 'Plants');

	// words and a category together
	await page.locator('#sp-q').fill('heater');
	await page.locator('#sp-cat').selectOption('equipment');
	await page.getByRole('button', { name: 'Show' }).click();
	await expect(page).toHaveURL(/cat=equipment/);
	await expect(page.getByText('Showing 1 of 3 · $39.99')).toBeVisible();
	await expect(page.locator('section[aria-labelledby="list-h"] .list li')).toHaveCount(1);
	// the headline totals stay the tank's
	await expect(page.locator('.tile', { hasText: 'This month' })).toContainText('$56.99');

	// the CSV of what's shown
	const csvLink = page.getByRole('link', { name: 'Download CSV of these' });
	const res = await page.request.get((await csvLink.getAttribute('href'))!);
	expect(res.headers()['content-type']).toContain('text/csv');
	const text = await res.text();
	expect(text).toContain('Jäger heater');
	expect(text).not.toContain('suction cups');
	expect(text).not.toContain('Java moss');

	// a category bar keeps the words
	await page.getByRole('link', { name: /^Other/ }).first().click();
	await expect(page.locator('section[aria-labelledby="list-h"] .list li')).toHaveCount(1);
	await expect(page.locator('section[aria-labelledby="list-h"] .list')).toContainText('Heater suction cups');

	// dates with nothing in them say so, and Clear filters shows everything again
	const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
	await open(page, `/tanks/${tankId}/spending?from=${tomorrow}`);
	await expect(page.getByText('No expenses match these filters.')).toBeVisible();
	await page.getByRole('link', { name: 'Clear filters' }).first().click();
	await expect(page.locator('section[aria-labelledby="list-h"] .list li')).toHaveCount(3);

	// every expense, from Import & export
	await open(page, '/settings/export');
	await page.locator('label', { hasText: 'Whole account' }).click();
	const all = await page.request.get((await page.getByRole('link', { name: /Spending \(CSV\)/ }).getAttribute('href'))!);
	const allText = await all.text();
	for (const w of ['Jäger heater', 'Heater suction cups', 'Java moss']) expect(allText).toContain(w);
});
