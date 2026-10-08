import { defineConfig, devices } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs the production build against a throwaway database with the mock
// Google sign-in (AUTH_DEV_LOGIN) turned on.
const PORT = 4173;
export const LOCAL_ADMIN_PASSWORD = 'e2e-admin-password';
const salt = randomBytes(16);
const hash = `scrypt:${salt.toString('base64')}:${scryptSync(LOCAL_ADMIN_PASSWORD, salt, 64).toString('base64')}`;

// a Chromium already on the machine (PW_CHROMIUM=/path/to/chrome), when the pinned one can't be downloaded
const chromium = process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {};

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	// On GitHub: failures annotated on the run, and a report kept with the run's files.
	reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
	// Service workers are off except in the offline test, so caching can't hide bugs.
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		serviceWorkers: 'block'
	},
	// The full suite on Chromium, at a desktop and an Android phone's size; the
	// essentials (e2e/smoke.test.ts) also on an iPhone and desktop Safari (WebKit)
	// and Firefox (#104): npm run test:e2e:browsers, after
	// npx playwright install webkit firefox.
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, ...chromium }, testIgnore: 'perf.test.ts' },
		{ name: 'phone', use: { ...devices['Pixel 7'], ...chromium }, testIgnore: 'perf.test.ts' },
		{ name: 'iphone', use: { ...devices['iPhone 15'] }, testMatch: 'smoke.test.ts' },
		{ name: 'safari', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } }, testMatch: 'smoke.test.ts' },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } }, testMatch: 'smoke.test.ts' },
		// performance budgets (#110), on their own: npm run test:perf
		{ name: 'perf', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, ...chromium }, testMatch: 'perf.test.ts' }
	],
	webServer: {
		command: `rm -rf .e2e-data && npm run build && node build`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			PORT: String(PORT),
			ORIGIN: `http://localhost:${PORT}`,
			DATA_DIR: '.e2e-data',
			AUTH_SECRET: 'e2e-test-secret-not-for-production-use-000000',
			AUTH_DEV_LOGIN: 'true',
			BODY_SIZE_LIMIT: '64M',
			EMAIL_TRANSPORT: 'outbox',
			EMAIL_SCHEDULER: 'off',
			// the update check reads a test changelog with a newer release
			UPDATE_CHECK_URL: `http://localhost:${PORT}/dev/next-release`,
			// species photos from a stand-in for Wikipedia and Commons (src/routes/dev/wiki)
			STOCK_PHOTO_WIKI: `http://localhost:${PORT}/dev/wiki`,
			STOCK_PHOTO_COMMONS: `http://localhost:${PORT}/dev/wiki`,
			// species care from a tiny stand-in for FishBase's snapshot (e2e/files/fishbase)
			SPECIES_CARE_URL: pathToFileURL(resolve('e2e/files/fishbase')).href,
			LOCAL_ADMIN_PASSWORD_HASH: hash
		}
	}
});
