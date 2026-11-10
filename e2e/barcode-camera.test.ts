import { expect, test } from '@playwright/test';
import { newKeeperWithTank, open } from './helpers';

// Scan a barcode with the camera (#222): the Permissions-Policy header used
// to forbid the camera on every page, so the browser refused without asking.
// A stand-in camera, allowed without a prompt.
test.use({
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
		...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
	}
});

test('the scanner opens the camera', async ({ page }, info) => {
	await newKeeperWithTank(page, `camera-${info.project.name}`);
	const tankId = new URL(page.url()).searchParams.get('tank')!;
	const res = await page.goto(`/tanks/${tankId}/equipment/scan`);
	// this site's own pages may use the camera; nothing else is opened up
	expect(res!.headers()['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
	await expect(page.getByText('Point the camera at the barcode')).toBeVisible();
	await expect(page.getByText('The camera was not allowed; a photo works too.')).toHaveCount(0);
	// frames are coming in
	await expect.poll(() => page.locator('.scanner video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Stop camera' }).click();
	await expect(page.getByText('Camera off')).toBeVisible();
	await open(page, `/tanks/${tankId}/equipment`);
});
