import { expect, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/** Navigate and wait until the app has hydrated, so typed input isn't lost. */
export async function open(page: Page, url: string) {
	await page.goto(url);
	await page.locator('html[data-ready="true"]').waitFor();
}

/** Sign in with the mock Google login, finish setup and create a tank. Returns the email used. */
/** A new keeper with one tank; a planted one is grown as `grown` says (#81: Not sure, the default, starts with the basics). */
export async function newKeeperWithTank(page: Page, tag: string, type: 'Freshwater' | 'Planted' | 'Reef' = 'Planted', grown?: 'Low-tech' | 'CO₂ injected' | 'Not sure') {
	const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Riverbed 40');
	await page.locator('label', { hasText: type }).click();
	if (grown) await page.getByRole('group', { name: 'How is it grown?' }).locator('label', { hasText: grown }).click();
	await page.getByLabel('Volume').fill('40');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();
	return email;
}

interface OutboxMail {
	to: string;
	subject: string;
	html: string;
	text: string;
	headers?: Record<string, string>;
}

/** Emails the app "sent" (EMAIL_TRANSPORT=outbox), waiting until one matches. */
export async function waitForMail(to: string, match: (m: OutboxMail) => boolean = () => true, timeout = 5000) {
	const dir = join('.e2e-data', 'outbox');
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		if (existsSync(dir)) {
			for (const f of readdirSync(dir).sort()) {
				const m = JSON.parse(readFileSync(join(dir, f), 'utf8')) as OutboxMail;
				if (m.to === to && match(m)) return m;
			}
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`No email to ${to} matched`);
}

/** First link in an email's text version that contains `needle`. */
export function linkIn(mail: OutboxMail, needle: string) {
	const url = mail.text.match(new RegExp(`https?://\\S*${needle}\\S*`))?.[0];
	if (!url) throw new Error(`No ${needle} link in "${mail.subject}"`);
	return url;
}

/** Open the Quick add sheet: the phone's Log button, or More… under the desktop's Log water test ▾. */
export async function openQuickAdd(page: Page) {
	const log = page.getByRole('button', { name: 'Log', exact: true });
	if (await log.isVisible()) {
		await log.click();
	} else {
		await page.getByRole('button', { name: 'Other log types' }).click();
		await page.getByRole('menuitem', { name: 'More…' }).click();
	}
	await expect(page.getByRole('dialog', { name: 'Quick add' })).toBeVisible();
}

/** The tank's name in the shell: a heading on desktop, the switch-tank button on phones. */
export function tankTitle(page: Page, name: string) {
	return page.getByRole('heading', { name, level: 1, exact: true }).or(page.getByRole('button', { name: `${name}, switch tank` })).first();
}

/** The value of a DateField (a hidden input named `name`). */
export function dateValue(page: Page, name: string) {
	return page.locator(`input[type=hidden][name="${name}"]`).inputValue();
}

/** Pick `ymd` (YYYY-MM-DD) in a DateField: open its calendar, go to the month, tap the day. */
export async function pickDate(page: Page, name: string, ymd: string) {
	const noon = (d: string) => new Date(d + 'T12:00:00Z');
	const shown = (await dateValue(page, name)) || new Date().toISOString().slice(0, 10);
	await page.locator(`input[type=hidden][name="${name}"] + button`).click();
	const sheet = page.getByRole('dialog');
	const months = (noon(ymd).getUTCFullYear() - noon(shown).getUTCFullYear()) * 12 + noon(ymd).getUTCMonth() - noon(shown).getUTCMonth();
	for (let i = 0; i < Math.abs(months); i++) await sheet.getByRole('button', { name: months > 0 ? 'Next month' : 'Previous month' }).click();
	const day = noon(ymd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
	await sheet.getByRole('button', { name: day, exact: true }).click();
	await expect(page.locator(`input[type=hidden][name="${name}"]`)).toHaveValue(ymd);
}

/** A small JPEG to upload; with `taken` ("2026:09:14 15:20:00", and an offset like "+02:00"), one whose details say when it was taken. */
export async function jpeg(color = '#2a8c84', name = 'tank.jpg', taken?: { at: string; offset?: string }) {
	let img = sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg();
	if (taken) img = img.withExif({ IFD2: { DateTimeOriginal: taken.at, ...(taken.offset ? { OffsetTimeOriginal: taken.offset } : {}) } });
	const buffer = await img.toBuffer();
	return { name, mimeType: 'image/jpeg', buffer };
}
