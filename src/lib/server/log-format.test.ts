import { describe, expect, it } from 'vitest';
import { errorDetails, formatLine, kept, maskEmails, redact } from './log-format';

describe('levels', () => {
	it('keeps what the detail setting lets through', () => {
		expect(kept('error', 'warn')).toBe(true);
		expect(kept('warn', 'warn')).toBe(true);
		expect(kept('info', 'warn')).toBe(false);
		expect(kept('info', 'info')).toBe(true);
		expect(kept('debug', 'info')).toBe(false);
		expect(kept('debug', 'debug')).toBe(true);
	});
});

describe('redact', () => {
	it('never writes down a password, secret, token or key', () => {
		expect(redact({ username: 'admin', password: 'hunter22', nested: { apiKey: 'k', clientSecret: 's', Authorization: 'Bearer x', ok: 1 } })).toEqual({
			username: 'admin',
			password: '[hidden]',
			nested: { apiKey: '[hidden]', clientSecret: '[hidden]', Authorization: '[hidden]', ok: 1 }
		});
	});

	it('cuts what is too long or too deep', () => {
		expect((redact('x'.repeat(5000)) as string).length).toBe(4001);
		expect(redact({ a: { b: { c: { d: { e: { f: 1 } } } } } })).toEqual({ a: { b: { c: { d: { e: '…' } } } } });
	});
});

describe('errorDetails', () => {
	it('keeps the message, kind, code and where it happened', () => {
		const e = Object.assign(new TypeError('boom'), { code: 'EFAIL' });
		const d = errorDetails(e);
		expect(d).toMatchObject({ error: 'boom', kind: 'TypeError', code: 'EFAIL' });
		expect(String(d.stack)).toContain('TypeError: boom');
		expect(errorDetails('plain')).toEqual({ error: 'plain' });
	});
});

describe('downloads', () => {
	it('hides email addresses, but keeps them apart', () => {
		expect(maskEmails('from alice@example.com to Bob.Smith@mail.example.org')).toBe('from a***@example.com to B***@mail.example.org');
	});

	it('writes one line per entry', () => {
		expect(
			formatLine({
				at: '2026-09-27T16:05:55.000Z',
				level: 'warn',
				area: 'sign-in',
				message: 'Google sign-in refused for jo@example.com',
				userId: '3a8f923c-1dc6-46c9',
				ref: null,
				details: { provider: 'google' }
			})
		).toBe('2026-09-27T16:05:55.000Z · WARN  · sign-in · Google sign-in refused for j***@example.com · user 3a8f923c {"provider":"google"}');
	});
});
