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
export async function newKeeperWithTank(page: Page, tag: string, type: 'Freshwater' | 'Planted' | 'Reef' = 'Planted') {
	const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
	await open(page, '/signin');
	await page.getByPlaceholder('Email').fill(email);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Riverbed 40');
	await page.locator('label', { hasText: type }).click();
	await page.getByLabel('Volume').fill('40');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByText('No readings yet')).toBeVisible();
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

/** A small JPEG to upload. */
export async function jpeg(color = '#2a8c84', name = 'tank.jpg') {
	const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
	return { name, mimeType: 'image/jpeg', buffer };
}
