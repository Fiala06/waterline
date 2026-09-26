import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('local admin password hashes', () => {
	it('verifies the right password and rejects others', () => {
		const h = hashPassword('correct horse');
		expect(h).toMatch(/^scrypt:[^:$]+:[^:$]+$/);
		expect(verifyPassword('correct horse', h)).toBe(true);
		expect(verifyPassword('wrong', h)).toBe(false);
	});

	it('rejects malformed hashes', () => {
		expect(verifyPassword('x', '')).toBe(false);
		expect(verifyPassword('x', 'bcrypt:abc:def')).toBe(false);
	});
});
