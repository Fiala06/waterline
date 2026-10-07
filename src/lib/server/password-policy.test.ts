import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN, passwordProblem } from './password-policy';

describe('the local admin password (#102)', () => {
	it('asks for 12 characters, counting characters, not bytes', () => {
		expect(PASSWORD_MIN).toBe(12);
		expect(passwordProblem('brine shrimp')).toBeNull(); // 12, spaces count
		expect(passwordProblem('brine shrim')).toMatch(/at least 12 characters/);
		// 11 characters that take more than 12 UTF-16 units: still too short
		expect(passwordProblem('🐟🐠🐡🦐🦑🐙🦀🐚🌿🪸🫧')).toMatch(/at least 12/);
		expect(passwordProblem('ñandú corre rápido')).toBeNull();
		expect(passwordProblem('x'.repeat(1025))).toMatch(/at most 1024/);
	});

	it('takes a long passphrase, with no rules about capitals, digits or symbols', () => {
		expect(passwordProblem('correct horse battery staple')).toBeNull();
		expect(passwordProblem('kelp forest by noon')).toBeNull();
		expect(passwordProblem('#$%&*!@^)(+=')).toBeNull(); // symbols only, not a run
		expect(passwordProblem('a'.repeat(3) + ' quiet reef at night ' + 'z'.repeat(3))).toBeNull();
	});

	it('refuses passwords people try first: the common list, runs, repeats, names', () => {
		const tryFirst = /one people try first/;
		for (const p of ['qwerty123456', '1q2w3e4r5t6y', 'Leavemealone', 'QAZWSXEDCRFV']) expect(passwordProblem(p), p).toMatch(tryFirst);
		for (const p of ['123456789012', 'qwertyuiop[]', 'abcdefghijklm', '0987654321ab', 'aaaaaaaaaaaa', 'abcabcabcabc']) expect(passwordProblem(p), p).toMatch(tryFirst);
		for (const p of ['Password2026!', 'waterline123', 'admin admin 12', 'a-good-password']) expect(passwordProblem(p), p).toMatch(tryFirst);
		// the username or the address with a little added
		expect(passwordProblem('reefkeeper2026', ['reefkeeper'])).toMatch(tryFirst);
		expect(passwordProblem('cory.fiala!!!', ['admin', 'cory.fiala@example.com'])).toBeNull();
		expect(passwordProblem('corygmailcom1', ['cory@gmail.com'])).toMatch(tryFirst);
	});

	it("never says which list or rule it was, only how to choose a better one", () => {
		const msg = passwordProblem('qwerty123456')!;
		expect(msg).toMatch(/a few unrelated words/);
		expect(msg).not.toMatch(/list|leak|breach|qwerty/i);
	});
});
