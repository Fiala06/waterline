import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/** Sign in with the mock Google login, finish setup and create a tank. */
export async function newKeeperWithTank(page: Page, tag: string, type: 'Freshwater' | 'Planted' | 'Reef' = 'Planted') {
	await page.goto('/signin');
	await page.getByPlaceholder('Email').fill(`${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
	await page.getByRole('button', { name: /Sign in with Google/ }).click();
	await page.getByRole('button', { name: 'Continue to first tank' }).click();
	await page.getByLabel('Tank name').fill('Riverbed 40');
	await page.locator('label', { hasText: type }).click();
	await page.getByLabel('Volume').fill('40');
	await page.getByRole('button', { name: 'Create tank' }).click();
	await expect(page.getByText('No readings yet')).toBeVisible();
}

/** A small JPEG to upload. */
export async function jpeg(color = '#2a8c84', name = 'tank.jpg') {
	const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
	return { name, mimeType: 'image/jpeg', buffer };
}
