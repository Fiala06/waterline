import { describe, expect, it } from 'vitest';
import { hashPassword, isValidPasswordHash, verifyPassword } from './password';

describe('local admin password hashes', () => {
	it('verifies the right password and rejects others', async () => {
		const h = hashPassword('correct horse');
		expect(h).toMatch(/^scrypt:[^:$]+:[^:$]+$/);
		expect(isValidPasswordHash(h)).toBe(true);
		expect(await verifyPassword('correct horse', h)).toBe(true);
		expect(await verifyPassword('wrong', h)).toBe(false);
	});

	it('rejects malformed hashes', async () => {
		const [, salt, hash] = hashPassword('x').split(':');
		for (const bad of ['', 'bcrypt:abc:def', 'scrypt:x:A', `scrypt:${salt}:!!!!`, `scrypt:${salt}:AAAA`, `scrypt:${salt}:${hash}:extra`]) {
			expect(isValidPasswordHash(bad)).toBe(false);
			expect(await verifyPassword('anything-at-all', bad)).toBe(false);
			expect(await verifyPassword('', bad)).toBe(false);
		}
	});
});
