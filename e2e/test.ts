import { expect, test as base } from '@playwright/test';

/**
 * Playwright's `test`, failing any test whose pages throw an uncaught error
 * (#326: an effect loop showed only in the browser's console). Every e2e file
 * imports `test` and `expect` from here, not from '@playwright/test'.
 */
export const test = base.extend<{ pageErrors: void }>({
	pageErrors: [
		async ({ context }, use) => {
			const errors: string[] = [];
			const watch = (p: import('@playwright/test').Page) => p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
			context.pages().forEach(watch);
			context.on('page', watch);
			await use();
			expect(errors, 'uncaught errors in the page').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };
