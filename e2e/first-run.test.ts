import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';

// A server with nothing set but ORIGIN, like a fresh install: its first page
// asks for the setup code from its log, then the admin login, and everything
// else (Google sign-in, who can sign in, the switches) is set in the app.
test.describe.configure({ mode: 'serial' });

let server: ChildProcess;
let base = '';
let dir = '';
let log = '';

test.beforeAll(async ({ browserName: _ }, info) => {
	const port = info.project.name === 'desktop' ? 4174 : 4175;
	base = `http://localhost:${port}`;
	dir = `.e2e-fresh-${info.project.name}`;
	rmSync(dir, { recursive: true, force: true });
	// the build from the main test server (playwright.config.ts)
	server = spawn(process.execPath, ['build'], {
		env: {
			PATH: process.env.PATH,
			PORT: String(port),
			ORIGIN: base,
			DATA_DIR: dir,
			EMAIL_TRANSPORT: 'outbox',
			EMAIL_SCHEDULER: 'off',
			UPDATE_CHECK_URL: 'http://localhost:4173/dev/next-release'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	server.stdout!.on('data', (d) => (log += d));
	server.stderr!.on('data', (d) => (log += d));
	await expect
		.poll(async () => fetch(`${base}/first-run`).then((r) => r.status).catch(() => 0), { timeout: 20_000 })
		.toBe(200);
});

test.afterAll(() => {
	server?.kill();
	rmSync(dir, { recursive: true, force: true });
});

const at = (path: string) => `${base}${path}`;

async function fillSetup(page: Page, code: string, password: string, confirm = password) {
	await page.getByLabel('Setup code').fill(code);
	await page.getByLabel('Admin username').fill('Admin');
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByLabel('Password again').fill(confirm);
	await page.getByRole('button', { name: 'Create admin login' }).click();
}

test('a new server asks for the setup code from its log, then the admin login', async ({ browser }) => {
	// no scripts: it's a plain form
	const ctx = await browser.newContext({ javaScriptEnabled: false });
	const page = await ctx.newPage();
	await page.goto(at('/'));
	await expect(page).toHaveURL(at('/first-run'));
	await expect(page.getByRole('heading', { name: 'Set up Waterline' })).toBeVisible();

	// the code is in the log and in the data folder; the server made its own keys
	const code = readFileSync(`${dir}/setup-code.txt`, 'utf8').trim();
	expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
	expect(log).toContain(code);
	expect(existsSync(`${dir}/keys.json`)).toBe(true);

	await fillSetup(page, 'WRON-GCOD', 'a-good-password');
	await expect(page.getByText("That isn't the setup code. Copy it from the server's log.")).toBeVisible();
	// (a short password doesn't get past the browser: the field needs 8 characters)
	await fillSetup(page, code.toLowerCase().replace('-', ''), 'a-good-password', 'a-typo-password');
	await expect(page.getByText("The passwords don't match.")).toBeVisible();
	await expect(page.getByLabel('Setup code')).toHaveValue(code.toLowerCase().replace('-', ''));
	await page.getByLabel('Password', { exact: true }).fill('a-good-password');
	await page.getByLabel('Password again').fill('a-good-password');
	await page.getByRole('button', { name: 'Create admin login' }).click();

	// signed in as the admin, on to the account's own setup; the code is gone
	await expect(page).toHaveURL(at('/setup'));
	expect(existsSync(`${dir}/setup-code.txt`)).toBe(false);
	await page.goto(at('/first-run'));
	await expect(page).not.toHaveURL(at('/first-run'));
	await ctx.close();
});

test('the admin sets up sign-in and the server in the app', async ({ page }) => {
	await page.goto(at('/signin?local'));
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('a-good-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Riverbed 40');
	await page.getByLabel('Volume').fill('40');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();

	await page.goto(at('/settings/server'));
	await page.locator('html[data-ready="true"]').waitFor();
	const status = page.getByRole('status');

	// Google sign-in: its client, and the redirect URI to give Google
	await expect(page.getByText(`${base}/auth/callback/google`)).toBeVisible();
	const google = page.locator('form', { has: page.getByLabel('Client ID') });
	await page.getByLabel('Client ID').fill('1234-test.apps.googleusercontent.com');
	await google.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('✕ Paste the client secret too.')).toBeVisible();
	await page.getByLabel('Client secret').fill('a-client-secret');
	await google.getByRole('button', { name: 'Save' }).click();
	// and the next step: the admin's own Google account, or Google turns them away too
	await expect(status).toContainText("✓ Google sign-in saved. Now enter your Google account as the admin's, under Who can sign in.");
	await expect(page.getByLabel('Client secret')).toHaveAttribute('placeholder', 'Saved · leave empty to keep it');
	const access = page.locator('form.access');
	await expect(access.getByText("▲ Enter your own Google account as the admin's")).toBeVisible();
	await access.getByLabel("Admin's Google account").fill('owner@example.com');
	await access.getByRole('button', { name: 'Save' }).click();
	await expect(status).toContainText('✓ Sign-in settings saved');
	await expect(access.getByText("▲ Enter your own Google account as the admin's")).toHaveCount(0);

	// who can sign in: a list, checked
	await access.getByLabel('The admin and these people').check();
	await access.getByLabel('Emails and domains').fill('friend@example.com\n@family.example\nnot an email');
	await access.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('✕ Not an email or @domain: not, an, email')).toBeVisible();
	await access.getByLabel('Emails and domains').fill('friend@example.com\n@family.example');
	await access.getByRole('button', { name: 'Save' }).click();
	await expect(status).toContainText('✓ Sign-in settings saved');

	// the local admin's password, changed
	await page.getByLabel('New password').fill('a-newer-password');
	await page.getByLabel('Password again').fill('a-newer-password');
	await page.locator('form', { has: page.getByLabel('New password') }).getByRole('button', { name: 'Save' }).click();
	await expect(status).toContainText('✓ Local admin login saved');

	// a switch, remembered
	await page.getByLabel('Check for new versions').uncheck();
	await page.locator('form', { has: page.getByLabel('Check for new versions') }).getByRole('button', { name: 'Save' }).click();
	await expect(status).toContainText('✓ Server settings saved');
	await page.reload();
	await expect(page.getByLabel('Check for new versions')).not.toBeChecked();
	await expect(page.locator('form.access').getByLabel('Emails and domains')).toHaveValue('friend@example.com\n@family.example');

	// signed out: Google is offered, and only the new password opens the admin login
	// from the account menu, under the photo (the dashboard has it on phones too)
	await page.goto(at('/'));
	await page.locator('html[data-ready="true"]').waitFor();
	await page.getByRole('button', { name: /^Account: / }).locator('visible=true').click();
	await page.getByRole('button', { name: 'Sign out' }).locator('visible=true').click();
	await expect(page).toHaveURL(/\/signin/);
	await page.goto(at('/'));
	await expect(page).toHaveURL(/\/signin/);
	await page.goto(at('/signin?local'));
	await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('a-good-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page.getByRole('alert')).toContainText('Wrong username or password.');
	await page.getByPlaceholder('Admin username').fill('admin');
	await page.getByPlaceholder('Password').fill('a-newer-password');
	await page.getByRole('button', { name: 'Local admin login' }).click();
	await expect(page).toHaveURL(at('/'));
	// the same account as before the admin's Google account was set, tank and all
	await expect(page.getByRole('heading', { name: 'Riverbed 40', level: 1, exact: true }).or(page.getByRole('button', { name: 'Riverbed 40, switch tank' })).first()).toBeVisible();
});
