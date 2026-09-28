import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { newKeeperWithTank, open } from './helpers';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version.replace(/^(\d+\.\d+)\.0$/, '$1');
const releases = readFileSync('CHANGELOG.md', 'utf8').split(/^## (?=\d)/m).slice(1);
/** How many lines the newest release has in CHANGELOG.md (the card shows the first 3). */
const lines = releases[0].split('\n').filter((l) => l.startsWith('- ')).length;
/** The release before this one, and how many lines every release after 1.0.0 has. */
const previous = releases[1].split(' ')[0];
const since10 = releases.slice(0, -1).join('').split('\n').filter((l) => l.startsWith('- ')).length;

/** Change an account in the test database. */
function setUser(email: string, set: string) {
	const db = new Database('.e2e-data/waterline.db');
	db.prepare(`update users set ${set} where email = ?`).run(email);
	db.close();
}
/** An account from before this version: it last saw the previous release's What's new. */
const fromBefore = (email: string, seen = previous) => setUser(email, `seen_version = '${seen}'`);

test("What's new: once after an update, then in Settings", async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `whats-new-${info.project.name}`);
	const card = page.getByRole('region', { name: `What's new in ${version}` });

	// a new account has nothing new to see
	await open(page, '/');
	await expect(page.getByText('Latest readings').or(page.getByText('No readings yet')).first()).toBeVisible();
	await expect(card).toHaveCount(0);

	// after an update: the new version's first lines, until it's seen
	fromBefore(email);
	await open(page, '/');
	await expect(card).toBeVisible();
	await expect(card.getByRole('listitem')).toHaveCount(Math.min(3, lines));
	if (lines > 3) await expect(card.getByText(`and ${lines - 3} more`, { exact: true })).toBeVisible();
	else await expect(card.getByText(/^and \d+ more$/)).toHaveCount(0);
	await card.getByRole('button', { name: "See what's new" }).click();
	await expect(page).toHaveURL('/settings/changelog');
	await expect(page.getByRole('heading', { name: "What's new", exact: true })).toBeVisible();
	await expect(page.getByText(`You're on Waterline ${version}.`)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Waterline on GitHub' })).toHaveAttribute('href', 'https://github.com/Fiala06/waterline');
	await expect(page.getByRole('heading', { name: new RegExp(`^${version.replace('.', '\\.')} `) })).toBeVisible();
	// older releases fold away by version, and open on tap
	await expect(page.getByRole('heading', { name: 'Earlier releases' })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^1\.0 / })).toBeHidden();
	await page.locator('summary', { hasText: /^1\.0/ }).click();
	await expect(page.getByRole('heading', { name: /^1\.0 / })).toBeVisible();
	await open(page, '/');
	await expect(page.getByText('Latest readings').or(page.getByText('No readings yet')).first()).toBeVisible();
	await expect(card).toHaveCount(0);

	// several updates at once: everything since the one last seen
	fromBefore(email, '1.0.0');
	await open(page, '/');
	const since = page.getByRole('region', { name: "What's new since 1.0" });
	await expect(since.getByRole('listitem')).toHaveCount(3);
	await expect(since.getByText(`and ${since10 - 3} more`, { exact: true })).toBeVisible();
	await since.getByRole('button', { name: 'Got it' }).click();
	await expect(since).toHaveCount(0);

	// Settings shows the running version, and it leads here
	await open(page, '/settings');
	await page.getByRole('link', { name: `Waterline v${version} · self-hosted · What's new` }).click();
	await expect(page).toHaveURL('/settings/changelog');
});

test("What's new: Got it works without scripts", async ({ page, browser }, info) => {
	const email = await newKeeperWithTank(page, `whats-new-plain-${info.project.name}`);
	fromBefore(email);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/');
	const card = plain.getByRole('region', { name: `What's new in ${version}` });
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Got it' }).click();
	await expect(plain).toHaveURL('/');
	await expect(card).toHaveCount(0);
	await ctx.close();
});

test('the version is always in the menu; admins see when a newer one is out', async ({ page }, info) => {
	const email = await newKeeperWithTank(page, `version-${info.project.name}`);
	const desktop = info.project.name === 'desktop';
	// the test server's update check reads a changelog with a 99.0 release (UPDATE_CHECK_URL)
	const note = 'Update to 99.0 available';

	// everyone: the version running, under Settings (desktop) and in Settings' footer
	await open(page, '/');
	if (desktop) {
		await expect(page.getByRole('link', { name: `Waterline v${version}`, exact: true })).toBeVisible();
		await page.getByRole('link', { name: `Waterline v${version}`, exact: true }).click();
		await expect(page).toHaveURL('/settings/changelog');
	}
	await open(page, '/settings');
	await expect(page.getByRole('link', { name: `Waterline v${version} · self-hosted · What's new`, exact: true })).toBeVisible();

	// an admin, who can update the server, sees the newer release
	setUser(email, 'is_admin = 1');
	await expect(async () => {
		await open(page, '/settings');
		await expect(page.getByRole('link', { name: new RegExp(`What's new · ${note}`) })).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
	if (desktop) await expect(page.getByRole('link', { name: `Waterline v${version} ${note}` })).toBeVisible();
	await page.getByRole('link', { name: new RegExp(`What's new · ${note}`) }).click();
	await expect(page.getByRole('heading', { name: 'Waterline 99.0 is out' })).toBeVisible();
	await expect(page.getByText('a release from the future, for the tests.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Changelog on GitHub' })).toHaveAttribute('href', /\/dev\/next-release$/);
});
