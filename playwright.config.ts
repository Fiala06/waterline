import { defineConfig, devices } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';

// Runs the production build against a throwaway database with the mock
// Google sign-in (AUTH_DEV_LOGIN) turned on.
const PORT = 4173;
export const LOCAL_ADMIN_PASSWORD = 'e2e-admin-password';
const salt = randomBytes(16);
const hash = `scrypt:${salt.toString('base64')}:${scryptSync(LOCAL_ADMIN_PASSWORD, salt, 64).toString('base64')}`;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	// Service workers are off except in the offline test, so caching can't hide bugs.
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', serviceWorkers: 'block' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
		{ name: 'phone', use: { ...devices['Pixel 7'] } }
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
			LOCAL_ADMIN_PASSWORD_HASH: hash
		}
	}
});
