// Full-app audit sweep (opt-in): AUDIT=1 npx playwright test e2e/audit.test.ts --project=desktop
// Seeds the demo account, visits every screen at phone / tablet / desktop in
// dark and light, and records console errors, failed requests, horizontal
// overflow, small tap targets and axe accessibility violations to
// test-results/audit.json.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test.skip(!process.env.AUDIT, 'set AUDIT=1 to run the audit sweep');
test.setTimeout(20 * 60_000);

const VIEWPORTS = [
	{ name: 'phone', width: 375, height: 812 },
	{ name: 'tablet', width: 768, height: 1024 },
	{ name: 'desktop', width: 1280, height: 900 }
];
const THEMES = ['dark', 'light'] as const;

interface Issue {
	route: string;
	viewport: string;
	theme: string;
	kind: string;
	detail: string;
}

async function signIn(page: Page, email: string) {
	await page.goto('/signin');
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
}

async function hrefs(page: Page, url: string, selector: string) {
	await page.goto(url);
	await page.locator('html[data-ready="true"]').waitFor();
	return page.locator(selector).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!).filter(Boolean));
}

test('audit every screen', async ({ page, browser, request }) => {
	const seeded = await (await request.post('/dev/seed')).json();
	const tank = seeded.plantedTank as string;
	await signIn(page, 'demo@example.com');

	// Discover ids from the UI
	const testEntry = (await hrefs(page, '/history?range=all&cat=test', 'a.row'))[0];
	const eventEntries = await hrefs(page, '/history?range=all', 'a.row[href^="/entries/event/"]');
	const photos = await hrefs(page, '/photos', 'a.tile');
	const photo = photos[0];
	const task = (await hrefs(page, '/tasks', 'a.rtext, a.otext'))[0];
	const equipmentItem = (await hrefs(page, `/tanks/${tank}/equipment`, 'a.item'))[0];
	// the seeded share is on one of the photos
	let shareId: string | null = null;
	for (const p of photos) {
		await page.goto(p);
		const url = await page.locator('aside .s-url').inputValue({ timeout: 1500 }).catch(() => '');
		if (url) {
			shareId = url.split('/s/')[1];
			break;
		}
	}

	const routes = [
		'/',
		'/tanks',
		'/tanks/new',
		`/tanks/${tank}`,
		`/tanks/${tank}/equipment`,
		`/tanks/${tank}/livestock`,
		`/tanks/${tank}/plants`,
		`/tanks/${tank}/settings`,
		`/tanks/${tank}/targets`,
		`/tanks/${tank}/public`,
		`/tanks/${tank}/equipment/new`,
		equipmentItem,
		`/tanks/${tank}/livestock/new`,
		'/tasks',
		'/tasks/new',
		task,
		'/history',
		'/history?range=all&cat=water_change',
		'/charts',
		'/charts?r=3m',
		'/photos',
		photo,
		testEntry,
		`${testEntry}/edit`,
		eventEntries[0],
		`${eventEntries[0]}/edit`,
		`/log/test?tank=${tank}`,
		...['water_change', 'dosing', 'maintenance', 'livestock', 'equipment', 'observation', 'note'].map(
			(c) => `/log/event?tank=${tank}&category=${c}`
		),
		'/settings',
		'/settings/export',
		'/definitely-not-a-page'
	].filter(Boolean) as string[];

	const publicRoutes = ['/signin', '/t/riverbed-40-demo', ...(shareId ? [`/s/${shareId}`] : []), '/t/no-such-tank'];

	const issues: Issue[] = [];
	const visited: string[] = [];

	async function audit(p: Page, route: string, vp: (typeof VIEWPORTS)[number], theme: string) {
		const errors: string[] = [];
		const onConsole = (m: import('@playwright/test').ConsoleMessage) => m.type() === 'error' && errors.push(m.text());
		const onPageError = (e: Error) => errors.push(`pageerror: ${e.message}`);
		const failed: string[] = [];
		const onResponse = (r: import('@playwright/test').Response) => {
			const expected404 = route.includes('not-a-page') || route.includes('no-such-tank');
			if (r.status() >= 400 && !(expected404 && r.status() === 404)) failed.push(`${r.status()} ${r.url()}`);
		};
		p.on('console', onConsole);
		p.on('pageerror', onPageError);
		p.on('response', onResponse);
		await p.setViewportSize({ width: vp.width, height: vp.height });
		await p.emulateMedia({ colorScheme: theme as 'dark' | 'light', reducedMotion: 'reduce' });
		await p.goto(route);
		await p.locator('html[data-ready="true"]').waitFor({ timeout: 10_000 }).catch(() => {});
		await p.waitForTimeout(150);
		const add = (kind: string, detail: string) => issues.push({ route, viewport: vp.name, theme, kind, detail });

		for (const e of errors) add('console', e);
		for (const f of failed) add('http', f);

		const overflow = await p.evaluate(() => {
			const w = document.documentElement.clientWidth;
			if (document.documentElement.scrollWidth <= w + 1) return [];
			const out: string[] = [];
			for (const el of Array.from(document.body.querySelectorAll('*'))) {
				const r = el.getBoundingClientRect();
				if (r.width && r.right > w + 1) {
					// skip children inside horizontally scrolling containers
					let scroller = el.parentElement;
					let inScroller = false;
					while (scroller) {
						const ox = getComputedStyle(scroller).overflowX;
						if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') {
							inScroller = true;
							break;
						}
						scroller = scroller.parentElement;
					}
					if (!inScroller) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`);
				}
			}
			return out.slice(0, 5);
		});
		if (overflow.length) add('overflow', overflow.join(' | '));

		if (vp.name === 'phone') {
			const small = await p.evaluate(() => {
				const out: string[] = [];
				for (const el of Array.from(document.querySelectorAll('button, a.btn, input:not([type=hidden]), select, label.option, .segmented label, .chip'))) {
					const r = el.getBoundingClientRect();
					const style = getComputedStyle(el);
					if (!r.width || style.visibility === 'hidden' || style.display === 'none' || (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'file') continue;
					if (el.closest('[popover]:not(:popover-open), dialog:not([open]), [hidden]')) continue;
					if (r.height < 36) out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} "${(el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
				}
				return out.slice(0, 8);
			});
			if (small.length) add('tap-target', small.join(' | '));
		}

		// axe once per route and theme at phone + desktop
		if (vp.name !== 'tablet') {
			const axe = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze();
			for (const v of axe.violations) {
				add(`axe:${v.id}`, `${v.impact} · ${v.nodes.length} node(s) · ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}${v.id === 'color-contrast' ? ' · ' + (v.nodes[0]?.any[0]?.message ?? '').slice(0, 120) : ''}`);
			}
		}
		p.off('console', onConsole);
		p.off('pageerror', onPageError);
		p.off('response', onResponse);
		visited.push(`${route} [${vp.name}/${theme}]`);
	}

	for (const route of routes) for (const vp of VIEWPORTS) for (const theme of THEMES) await audit(page, route, vp, theme);

	const anon = await browser.newContext();
	const ap = await anon.newPage();
	for (const route of publicRoutes) for (const vp of VIEWPORTS) for (const theme of THEMES) await audit(ap, route, vp, theme);
	await anon.close();

	mkdirSync('test-results', { recursive: true });
	writeFileSync('test-results/audit.json', JSON.stringify({ visited: visited.length, issues }, null, 2));
	console.log(`AUDIT visited ${visited.length} screen/viewport/theme combinations, ${issues.length} issues → test-results/audit.json`);
	expect(visited.length).toBeGreaterThan(0);
});
