import { describe, expect, it } from 'vitest';
import { addressKey, allowRate, clearLoginFailures, isLocalLoginPath, loginBlockedMinutes, loginWaitSeconds, recordLoginFailure, resetLoginLimits } from './rate-limit';

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

describe('which paths are the local admin sign-in (#208)', () => {
	it('counts every spelling Auth.js takes for the same endpoint', () => {
		for (const p of ['/auth/callback/local', '/auth/callback/local/', '/auth/callback//local', '/auth//callback/local//']) expect(isLocalLoginPath(p), p).toBe(true);
	});

	it('leaves other paths alone', () => {
		for (const p of ['/auth/callback/google', '/auth/callback/local/x', '/auth/signin/local', '/callback/local', '/x/auth/callback/local', '//auth/callback/local']) expect(isLocalLoginPath(p), p).toBe(false);
	});
});

describe('who an address is counted as (#215)', () => {
	it('counts an IPv6 address by its /64, however it is written', () => {
		const a = addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
		expect(a).toBe('2001:db8:1:2::/64');
		expect(addressKey('2001:0db8:0001:0002::1')).toBe(a);
		expect(addressKey('[2001:db8:1:2::ffff]')).toBe(a);
		expect(addressKey('2001:db8:1:3::1')).not.toBe(a);
		expect(addressKey('::1')).toBe('0:0:0:0::/64');
		expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
	});

	it('leaves IPv4 as it is, also when written as IPv6', () => {
		expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
		expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
	});

	it('blocks the whole /64 after 5 failures from addresses in it', () => {
		resetLoginLimits();
		const t = 5_000_000;
		for (let i = 0; i < 5; i++) recordLoginFailure(`2001:db8:9:9::${i + 1}`, t + i);
		expect(loginBlockedMinutes('2001:db8:9:9::beef', t + 10)).toBe(15);
		expect(loginBlockedMinutes('2001:db8:9:8::beef', t + 10)).toBe(0);
	});
});

describe('wrong passwords from many addresses at once (#215)', () => {
	it('makes everyone wait between tries past 20 failures, a little longer each time, and never locks out', () => {
		resetLoginLimits();
		const t = 9_000_000;
		// 20 failures, each from its own address: none of them is blocked, and nobody waits yet
		for (let i = 0; i < 20; i++) recordLoginFailure(`198.51.100.${i}`, t + i);
		expect(loginWaitSeconds(t + 100)).toBe(0);
		recordLoginFailure('198.51.100.200', t + 1000);
		expect(loginWaitSeconds(t + 1000)).toBe(1);
		expect(loginWaitSeconds(t + 2000)).toBe(0);
		// it grows with each further failure, to half a minute at most
		for (let i = 0; i < 60; i++) recordLoginFailure(`203.0.113.${i}`, t + 3000 + i);
		expect(loginWaitSeconds(t + 3100)).toBe(30);
		expect(loginWaitSeconds(t + 3100 + 31_000)).toBe(0);
		// and is forgotten with the window
		expect(loginWaitSeconds(t + 16 * 60_000)).toBe(0);
		resetLoginLimits();
	});
});

describe('allowRate', () => {
	it('lets so many through a window per key', () => {
		const t = 1_000;
		for (let i = 0; i < 3; i++) expect(allowRate('test:a', 3, 60_000, t + i)).toBe(true);
		expect(allowRate('test:a', 3, 60_000, t + 10)).toBe(false);
		expect(allowRate('test:b', 3, 60_000, t + 10)).toBe(true);
		expect(allowRate('test:a', 3, 60_000, t + 61_000)).toBe(true);
	});
});
