import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { jpeg, newKeeperWithTank, open, openQuickAdd } from './helpers';

// Accessibility (#107): axe checks representative screens against WCAG 2.2 AA,
// on a phone and a desktop, in light and dark, with the dialogs open too.
// Serious and critical findings fail; A11Y_SURVEY=1 lists every finding instead.
// Exceptions, each narrow and with its reason, are in EXCEPT below. The manual
// checks axe can't do are in README › Tests › Accessibility.
test.setTimeout(240_000);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Findings we accept, by rule and the element they're on, each with why. */
const EXCEPT: { rule: string; target: RegExp; why: string }[] = [];

interface Finding {
	where: string;
	rule: string;
	impact: string;
	nodes: string[];
	help: string;
}

async function scan(page: Page, where: string, found: Finding[]) {
	const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	for (const v of violations) {
		const nodes = v.nodes.map((n) => n.target.join(' ')).filter((t) => !EXCEPT.some((e) => e.rule === v.id && e.target.test(t)));
		if (nodes.length) found.push({ where, rule: v.id, impact: v.impact ?? 'unknown', nodes: nodes.slice(0, 4), help: v.help });
	}
}

test('accessibility of representative screens', async ({ page, browser }, info) => {
	const phone = info.project.name === 'phone';
	// a keeper with a bit of everything: two tests (nitrate high, so there's an alert), a note with a photo, a public page
	const email = await newKeeperWithTank(page, `a11y-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const db = new Database('.e2e-data/waterline.db');
	db.prepare('update users set is_admin = 1 where email = ?').run(email);
	db.close();
	for (const [no3, ph] of [
		['10', '6.8'],
		['45', '7.0']
	]) {
		await open(page, `/entries/test/new?tank=${tankId}`);
		await page.getByLabel('Nitrate', { exact: true }).fill(no3);
		await page.getByLabel('pH', { exact: true }).fill(ph);
		await page.getByRole('button', { name: 'Save 2 readings' }).click();
		await expect(page.getByRole('status')).toContainText('Saved 2 readings');
	}
	await open(page, `/entries/event/new?tank=${tankId}&category=note`);
	await page.getByLabel('Note').fill('Trimmed the rotala');
	await page.locator('input[type=file][name=photos]').setInputFiles(await jpeg());
	await page.getByRole('button', { name: 'Save note' }).click();
	await expect(page.getByRole('status')).toContainText('Note saved');
	const slug = `a11y-${info.project.name}-${Date.now().toString(36)}`;
	await open(page, `/tanks/${tankId}/public`);
	await page.getByLabel('Share this tank').check({ force: true });
	await page.getByLabel('URL').fill(slug);
	await page.getByRole('button', { name: 'Save' }).first().click();
	await expect(page.getByText('✓ Public page saved')).toBeVisible();
	await open(page, '/photos');
	const photo = (await page.locator('a.tile').first().getAttribute('href'))!;

	const pages: [string, string][] = [
		['Dashboard', `/?tank=${tankId}`],
		['New water test', `/entries/test/new?tank=${tankId}`],
		['New note', `/entries/event/new?tank=${tankId}&category=note`],
		['History', '/history?range=all'],
		['Charts', `/charts?tank=${tankId}`],
		['Tank settings', `/tanks/${tankId}/settings`],
		['Sharing', `/tanks/${tankId}/sharing`],
		['Photos', '/photos'],
		['A photo', photo],
		['Tasks', '/tasks'],
		['Settings', '/settings'],
		['Server settings', '/settings/server'],
		['Server settings › People', '/settings/server/people']
	];

	const found: Finding[] = [];
	for (const theme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: theme });
		for (const [name, url] of pages) {
			await open(page, url);
			await scan(page, `${name} (${theme})`, found);
		}
		// dialogs: Quick add, Alerts, and on a computer the shortcuts
		await open(page, `/?tank=${tankId}`);
		await openQuickAdd(page);
		await scan(page, `Quick add (${theme})`, found);
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: /^Alerts/ }).first().click();
		await expect(page.getByRole('dialog').first()).toBeVisible();
		await scan(page, `Alerts (${theme})`, found);
		await page.keyboard.press('Escape');
		if (!phone) {
			await page.keyboard.press('?');
			await expect(page.getByRole('dialog').first()).toBeVisible();
			await scan(page, `Keyboard shortcuts (${theme})`, found);
			await page.keyboard.press('Escape');
		}

		// signed out: sign in and the public page
		const out = await browser.newContext({ colorScheme: theme, ...(phone ? { viewport: page.viewportSize()! } : {}) });
		const v = await out.newPage();
		await v.goto('/signin');
		await v.locator('html[data-ready="true"]').waitFor();
		await scan(v, `Sign in (${theme})`, found);
		await v.goto(`/t/${slug}`);
		await scan(v, `Public tank page (${theme})`, found);
		// a new account's setup: the welcome, then the first tank
		await v.goto('/signin');
		await v.locator('html[data-ready="true"]').waitFor();
		await v.getByPlaceholder('Email').fill(`a11y-new-${theme}-${info.project.name}-${Date.now()}@example.com`);
		await v.getByRole('button', { name: /Sign in with Google/ }).click();
		await expect(v).toHaveURL(/\/setup$/);
		await v.locator('html[data-ready="true"]').waitFor();
		await scan(v, `Setup (${theme})`, found);
		await v.getByRole('button', { name: 'Continue to first tank' }).click();
		await expect(v.getByLabel('Tank name')).toBeVisible();
		await scan(v, `Setup › first tank (${theme})`, found);
		await out.close();
	}

	const report = found.map((f) => `${f.where} · ${f.impact} · ${f.rule}: ${f.help}\n    ${f.nodes.join('\n    ')}`).join('\n');
	if (process.env.A11Y_SURVEY) {
		console.log(`\n${found.length} finding(s) on ${info.project.name}\n${report}`);
		return;
	}
	const blocking = found.filter((f) => f.impact === 'serious' || f.impact === 'critical');
	expect(blocking, `Serious or critical accessibility findings:\n${report}`).toEqual([]);
});
