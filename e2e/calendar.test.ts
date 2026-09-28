import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

test('tasks calendar: a private link, for all tanks or one, replaced or turned off', async ({ page }, info) => {
	await newKeeperWithTank(page, `cal-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;

	// from Tasks to the setting
	await open(page, '/tasks');
	await page.getByRole('link', { name: 'See your tasks in your calendar' }).click();
	await expect(page).toHaveURL(/\/settings#calendar$/);
	await page.getByRole('button', { name: 'Make a calendar link' }).click();
	await expect(page.getByRole('status')).toContainText('✓ Calendar link made');
	const url = await page.locator('#cal-url').inputValue();
	expect(url).toMatch(/\/cal\/[\w-]{20,}\.ics$/);
	await expect(page.getByRole('link', { name: 'Open in my calendar app' })).toHaveAttribute('href', url.replace(/^https?:/, 'webcal:'));

	// the calendar: the new tank's water change task, as an all-day event
	const res = await page.request.get(url);
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toBe('text/calendar; charset=utf-8');
	const ics = await res.text();
	expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
	expect(ics).toContain('X-WR-CALNAME:Waterline tasks');
	expect(ics).toMatch(/SUMMARY:Water change 25% · Riverbed 40\r\n/);
	expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
	// one tank; one that isn't theirs
	const one = await (await page.request.get(`${url}?tank=${tankId}`)).text();
	expect(one).toContain('X-WR-CALNAME:Waterline · Riverbed 40');
	expect((await page.request.get(`${url}?tank=not-a-tank`)).status()).toBe(404);

	// a new link: the old one stops working
	await page.reload();
	await expect(page.getByText(/yours last checked/)).toBeVisible();
	await page.getByRole('button', { name: 'Make a new link' }).click();
	await expect(page.getByRole('status')).toContainText('the old one no longer works');
	const next = await page.locator('#cal-url').inputValue();
	expect(next).not.toBe(url);
	expect((await page.request.get(url)).status()).toBe(404);
	expect((await page.request.get(next)).status()).toBe(200);

	// turned off
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByRole('button', { name: 'Make a calendar link' })).toBeVisible();
	expect((await page.request.get(next)).status()).toBe(404);
});

test('the calendar link works without scripts', async ({ page, browser }, info) => {
	await newKeeperWithTank(page, `cal-plain-${info.project.name}`);
	const ctx = await browser.newContext({ storageState: await page.context().storageState(), javaScriptEnabled: false });
	const plain = await ctx.newPage();
	await plain.goto('/settings');
	await plain.getByRole('button', { name: 'Make a calendar link' }).click();
	await expect(plain.locator('#cal-url')).toHaveValue(/\/cal\/[\w-]{20,}\.ics$/);
	await ctx.close();
});
