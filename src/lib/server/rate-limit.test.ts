import { describe, expect, it } from 'vitest';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from './rate-limit';

describe('local admin sign-in limit', () => {
	it('blocks after 5 failures for 15 minutes', () => {
		const t = 1_000_000;
		for (let i = 0; i < 4; i++) recordLoginFailure('1.2.3.4', t + i);
		expect(loginBlockedMinutes('1.2.3.4', t + 10)).toBe(0);
		recordLoginFailure('1.2.3.4', t + 5);
		expect(loginBlockedMinutes('1.2.3.4', t + 10)).toBe(15);
		expect(loginBlockedMinutes('5.6.7.8', t + 10)).toBe(0);
		expect(loginBlockedMinutes('1.2.3.4', t + 15 * 60_000 + 1)).toBe(0);
	});

	it('forgets failures after a successful sign-in', () => {
		for (let i = 0; i < 5; i++) recordLoginFailure('9.9.9.9');
		expect(loginBlockedMinutes('9.9.9.9')).toBeGreaterThan(0);
		clearLoginFailures('9.9.9.9');
		expect(loginBlockedMinutes('9.9.9.9')).toBe(0);
	});
});
