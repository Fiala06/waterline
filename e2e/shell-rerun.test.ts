import { expect, test, type Page } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #242: moving between pages doesn't gather the shell's data again (tanks, alerts,
// counts); arriving on another tank, or saving a form, does.
const shellFetched = (page: Page, path: string) =>
	page
		.waitForResponse((r) => new URL(r.url()).pathname === `${path}/__data.json`)
		.then(async (r) => (await r.text()).includes('alertsSeen'));

test("the shell's data is fetched again only when the tank changes", async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'the sidebar links');
	await newKeeperWithTank(page, 'shell-rerun');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	await open(page, '/history');

	// History to Charts: the page's data only
	let fetched = shellFetched(page, '/charts');
	await page.getByRole('link', { name: 'Charts', exact: true }).first().click();
	expect(await fetched).toBe(false);
	await expect(page).toHaveURL(/\/charts/);

	// a tank's own page (opened outright)
	await page.goto(`/tanks/${tankId}/livestock`);
	await page.locator('html[data-ready="true"]').waitFor();
	fetched = shellFetched(page, `/tanks/${tankId}/plants`);
	await page.getByRole('link', { name: /^Plants/ }).first().click();
	// a tab of the same tank: nothing of the shell again
	expect(await fetched).toBe(false);
});
