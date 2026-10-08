import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openQuickAdd } from './helpers';

// Performance budgets (#110): the pages people use most, with the demo
// account's months of data, measured in Chrome the way Core Web Vitals are:
// largest contentful paint, layout shift, the server's first byte, the
// JavaScript and the whole page that came down, and how long a tap takes to
// show something (Quick add). Each page is loaded three times in a fresh
// browser and the middle run counts, so one slow moment doesn't fail it.
// Budgets are in e2e/perf-budgets.json: over `warn` is flagged, over `fail`
// fails. Run alone (it seeds the demo account): npm run test:perf.
test.setTimeout(300_000);

const BUDGETS = JSON.parse(readFileSync(new URL('./perf-budgets.json', import.meta.url), 'utf8')) as {
	pages: Record<string, Record<Metric, { warn: number; fail: number }>>;
	interaction: { warn: number; fail: number };
};
type Metric = 'lcp' | 'cls' | 'ttfb' | 'jsKb' | 'totalKb';
const RUNS = 3;

/** What one load of a page measured. */
async function measure(page: Page, url: string): Promise<Record<Metric, number>> {
	await page.addInitScript(() => {
		const w = window as unknown as { __lcp: number; __cls: number };
		w.__lcp = 0;
		w.__cls = 0;
		new PerformanceObserver((l) => {
			for (const e of l.getEntries()) w.__lcp = Math.max(w.__lcp, e.startTime);
		}).observe({ type: 'largest-contentful-paint', buffered: true });
		new PerformanceObserver((l) => {
			for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls += e.value;
		}).observe({ type: 'layout-shift', buffered: true });
	});
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.locator('html[data-ready="true"]').waitFor();
	// let the last paint and any late shift land
	await page.waitForTimeout(300);
	return page.evaluate(() => {
		const w = window as unknown as { __lcp: number; __cls: number };
		const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
		const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
		const size = (r: PerformanceResourceTiming) => r.transferSize || r.encodedBodySize;
		const js = res.filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js')).reduce((n, r) => n + size(r), 0);
		const total = res.reduce((n, r) => n + size(r), 0) + (nav.transferSize || nav.encodedBodySize);
		return { lcp: Math.round(w.__lcp), cls: Math.round(w.__cls * 1000) / 1000, ttfb: Math.round(nav.responseStart - nav.requestStart), jsKb: Math.round(js / 1024), totalKb: Math.round(total / 1024) };
	});
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('the main pages stay within their performance budgets', async ({ browser, request }, info) => {
	test.skip(info.project.name !== 'perf', 'its own project: it seeds the demo account');
	const seeded = await (await request.post('/dev/seed')).json();
	const tank = seeded.plantedTank as string;
	// signed in once; each run gets a fresh browser with that sign-in and nothing cached
	const login = await browser.newContext();
	const lp = await login.newPage();
	await lp.goto('/signin');
	await lp.locator('html[data-ready="true"]').waitFor();
	await lp.getByPlaceholder('Email').fill(seeded.email);
	await lp.getByRole('button', { name: /Sign in with Google/ }).click();
	await lp.waitForURL((u) => !u.pathname.startsWith('/signin'));
	const state = await login.storageState();
	await login.close();

	const pages: [string, string, boolean][] = [
		['Sign in', '/signin', false],
		['Dashboard', `/?tank=${tank}`, true],
		['Charts', `/charts?tank=${tank}`, true],
		['History', `/history?tank=${tank}&range=all`, true],
		['Photos', `/photos?tank=${tank}`, true],
		['Public page', '/t/riverbed-40-demo', false]
	];
	const results: Record<string, Record<Metric, number>> = {};
	for (const [name, url, signedIn] of pages) {
		const runs: Record<Metric, number>[] = [];
		for (let i = 0; i < RUNS; i++) {
			const ctx = await browser.newContext(signedIn ? { storageState: state } : {});
			runs.push(await measure(await ctx.newPage(), url));
			await ctx.close();
		}
		results[name] = Object.fromEntries((['lcp', 'cls', 'ttfb', 'jsKb', 'totalKb'] as Metric[]).map((m) => [m, median(runs.map((r) => r[m]))])) as Record<Metric, number>;
	}

	// a tap: from pressing Quick add (on a computer, Log ▾ › More…) to its dialog painted, the slowest of three
	const ctx = await browser.newContext({ storageState: state });
	const p = await ctx.newPage();
	await p.goto(`/?tank=${tank}`);
	await p.locator('html[data-ready="true"]').waitFor();
	const taps: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const t0 = await p.evaluate(() => performance.now());
		await openQuickAdd(p);
		taps.push(Math.round((await p.evaluate(() => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now()))))) - t0));
		await p.keyboard.press('Escape');
		await expect(p.getByRole('dialog', { name: 'Quick add' })).toBeHidden();
	}
	const tap = Math.max(...taps);
	await ctx.close();

	// the report: in the run's summary on GitHub, and test-results/perf.json
	const flag = (v: number, b: { warn: number; fail: number }) => (v > b.fail ? '✕ over' : v > b.warn ? '▲ near' : '✓');
	const rows = Object.entries(results).map(([name, r]) => {
		const b = BUDGETS.pages[name];
		return `| ${name} | ${(['lcp', 'cls', 'ttfb', 'jsKb', 'totalKb'] as Metric[]).map((m) => `${r[m]} ${flag(r[m], b[m])}`).join(' | ')} |`;
	});
	const report = [
		'### Performance (median of 3 loads)',
		'',
		'| Page | LCP ms | CLS | TTFB ms | JS kB | Total kB |',
		'|---|---|---|---|---|---|',
		...rows,
		'',
		`Quick add opens in ${tap} ms ${flag(tap, BUDGETS.interaction)}`
	].join('\n');
	console.log(`\n${report}\n`);
	mkdirSync('test-results', { recursive: true });
	writeFileSync('test-results/perf.json', JSON.stringify({ pages: results, quickAddMs: tap }, null, 2));
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');

	const over = [
		...Object.entries(results).flatMap(([name, r]) => (Object.keys(r) as Metric[]).filter((m) => r[m] > BUDGETS.pages[name][m].fail).map((m) => `${name} ${m} ${r[m]} > ${BUDGETS.pages[name][m].fail}`)),
		...(tap > BUDGETS.interaction.fail ? [`Quick add ${tap} ms > ${BUDGETS.interaction.fail}`] : [])
	];
	expect(over, `Over budget:\n${over.join('\n')}`).toEqual([]);
});
