import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { authSecret, encryptionBase } from './instance';

const dir = mkdtempSync(join(tmpdir(), 'waterline-keys-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('instance keys', () => {
	it('makes its own keys on first use, kept in DATA_DIR/keys.json for the owner only', () => {
		const e = { DATA_DIR: dir };
		const auth = authSecret(e);
		const enc = encryptionBase(e);
		expect(auth).toMatch(/^[\w-]{43}$/);
		expect(enc).not.toBe(auth);
		const file = join(dir, 'keys.json');
		expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ authSecret: auth, encryptionKey: enc });
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(authSecret(e)).toBe(auth);
	});

	it('uses AUTH_SECRET and ENCRYPTION_KEY when they are set, as servers from before do', () => {
		expect(authSecret({ DATA_DIR: dir, AUTH_SECRET: 'from-the-environment' })).toBe('from-the-environment');
		// stored passwords from before were encrypted with a key from AUTH_SECRET
		expect(encryptionBase({ DATA_DIR: dir, AUTH_SECRET: 'from-the-environment' })).toBe('from-the-environment');
		expect(encryptionBase({ DATA_DIR: dir, AUTH_SECRET: 'from-the-environment', ENCRYPTION_KEY: 'its-own-key' })).toBe('its-own-key');
	});
});
