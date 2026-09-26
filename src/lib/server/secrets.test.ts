import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
	process.env.ENCRYPTION_KEY = 'test-key-for-unit-tests-only';
});

describe('secrets', async () => {
	const { decrypt, encrypt, sign, verify } = await import('./secrets');

	it('round-trips encrypted values and rejects tampering', () => {
		const enc = encrypt('smtp-password');
		expect(enc).toMatch(/^v1:/);
		expect(enc).not.toContain('smtp-password');
		expect(decrypt(enc)).toBe('smtp-password');
		const parts = enc.split(':');
		parts[3] = Buffer.from('tampered').toString('base64url');
		expect(decrypt(parts.join(':'))).toBeNull();
		expect(decrypt(null)).toBeNull();
	});

	it('signs and verifies links per purpose', () => {
		const s = sign('user-123', 'unsubscribe');
		expect(verify(s, 'unsubscribe')).toBe('user-123');
		expect(verify(s, 'other')).toBeNull();
		expect(verify('user-124' + s.slice(8), 'unsubscribe')).toBeNull();
		expect(verify('garbage', 'unsubscribe')).toBeNull();
	});
});
