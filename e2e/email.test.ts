import { expect, test } from '@playwright/test';
import { linkIn, newKeeperWithTank, open, waitForMail } from './helpers';

test('out-of-range alert and one-click unsubscribe', async ({ page, request }, info) => {
	const email = await newKeeperWithTank(page, `mail-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	await open(page, `/log/test?tank=${tankId}`);
	await page.getByLabel(/^Nitrate /).fill('40');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('1 out of range');

	const mail = await waitForMail(email, (m) => m.subject.startsWith('Nitrate is high'));
	expect(mail.subject).toBe('Nitrate is high in Riverbed 40: 40 ppm');
	expect(mail.text).toContain('Target: 5–20 ppm');
	expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

	// RFC 8058 one-click: a cross-site POST with no Origin header must work
	const unsub = mail.headers!['List-Unsubscribe'].slice(1, -1);
	const res = await request.post(unsub, {
		form: { 'List-Unsubscribe': 'One-Click' },
		headers: { origin: '' }
	});
	expect(res.status()).toBe(200);

	// ...and no more alerts arrive
	await open(page, `/log/test?tank=${tankId}`);
	await page.getByLabel(/^Nitrate /).fill('45');
	await page.getByRole('button', { name: 'Save 1 reading' }).click();
	await expect(page.getByRole('status')).toContainText('1 out of range');
	await expect(waitForMail(email, (m) => m.subject.includes(': 45 ppm'), 1500)).rejects.toThrow();

	await open(page, new URL(unsub).pathname);
	await expect(page.getByRole('heading', { name: 'Unsubscribe from all Waterline emails?' })).toBeVisible();

	// Other cross-site form posts are still refused
	const blocked = await request.post(`/tasks?/done`, { form: { taskId: 'x' }, headers: { origin: 'https://evil.example' } });
	expect(blocked.status()).toBe(403);
});

test('reminder email: Mark done link works once without signing in', async ({ page, browser }, info) => {
	const email = await newKeeperWithTank(page, `remind-${info.project.name}`);

	// A task due tomorrow → "Due tomorrow" reminder (default lead time is 1 day)
	await open(page, '/tasks/new');
	await page.getByLabel('Task').fill('Trim stem plants');
	const today = await page.getByLabel('Next due', { exact: true }).inputValue();
	const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10);
	await page.getByLabel('Next due', { exact: true }).fill(tomorrow);
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(page.getByRole('status')).toContainText('added');

	const run = await page.request.post('/dev/notify');
	expect(run.ok()).toBe(true);
	const mail = await waitForMail(email, (m) => m.subject.includes('Trim stem plants'));
	expect(mail.subject).toBe('Due tomorrow: Trim stem plants · Riverbed 40');

	// Running again doesn't send it twice
	expect((await (await page.request.post('/dev/notify')).json()).sent).toBe(0);

	// Open the link signed out, in a fresh browser context
	const done = linkIn(mail, '/e/');
	const ctx = await browser.newContext();
	const anon = await ctx.newPage();
	await anon.goto(done);
	await expect(anon.getByRole('heading', { name: 'Mark “Trim stem plants” done?' })).toBeVisible();
	await anon.getByRole('button', { name: 'Mark done' }).click();
	await expect(anon.getByRole('heading', { name: '✓ Trim stem plants done' })).toBeVisible();
	await anon.goto(done);
	await expect(anon.getByRole('heading', { name: 'This link was already used.' })).toBeVisible();
	await ctx.close();
});
