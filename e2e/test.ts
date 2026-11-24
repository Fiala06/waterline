import { expect, test as base, type Page } from '@playwright/test';

/**
 * Safari's report of a page-data fetch cut short by leaving the page: SvelteKit's
 * hover preload (data-sveltekit-preload-data) doesn't catch it, and WebKit words a
 * cancelled fetch as "…due to access control checks". Harmless, and on our own
 * origin it can't be a real access-control failure, so it isn't counted.
 */
function cancelledPreload(e: Error, origin: string) {
	const m = /^Fetch API cannot load (\S+) due to access control checks\.$/.exec(e.stack?.split('\n')[0] ?? '');
	if (!m) return false;
	const url = new URL(m[1]);
	return url.origin === origin && url.pathname.endsWith('/__data.json');
}

/**
 * Playwright's `test`, failing any test whose pages throw an uncaught error
 * (#326: an effect loop showed only in the browser's console). Every e2e file
 * imports `test` and `expect` from here, not from '@playwright/test'.
 */
export const test = base.extend<{ pageErrors: void }>({
	pageErrors: [
		async ({ context, baseURL }, use) => {
			const errors: string[] = [];
			const origin = new URL(baseURL!).origin;
			const watch = (p: Page) =>
				p.on('pageerror', (e) => {
					if (!cancelledPreload(e, origin)) errors.push(`${p.url()}: ${e.message}`);
				});
			context.pages().forEach(watch);
			context.on('page', watch);
			await use();
			expect(errors, 'uncaught errors in the page').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };
