import { expect, test, type Page } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// #242: moving between pages doesn't gather the shell's data again (tanks, alerts,
// counts); arriving on another tank, or saving a form, does.
// the data request says which loads it wants: one flag per layout and page, root first, then the app's shell
const shellFetched = (page: Page, path: string) =>
	page
		.waitForRequest((r) => new URL(r.url()).pathname === `${path}/__data.json`)
		.then((r) => new URL(r.url()).searchParams.get('x-sveltekit-invalidated')?.[1] === '1');

test("the shell's data is fetched again only when the tank changes", async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'the sidebar links');
	await newKeeperWithTank(page, 'shell-rerun');
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	// the sidebar's links carry the tank (?tank=), as the page they're on does
	await open(page, `/history?tank=${tankId}`);

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
