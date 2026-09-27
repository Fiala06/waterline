import { describe, expect, it } from 'vitest';
import { listAllows, parseAllowed, signupRules, validAllowed } from './sign-in-rules';

describe('parseAllowed', () => {
	it('reads a list however it was written: commas, spaces or one per line', () => {
		expect(parseAllowed('Me@Example.com, @family.example\n  friend@x.org;other@y.net ')).toEqual(['me@example.com', '@family.example', 'friend@x.org', 'other@y.net']);
		expect(parseAllowed(null)).toEqual([]);
	});

	it('knows an email or @domain', () => {
		expect(['me@example.com', '@family.example'].every(validAllowed)).toBe(true);
		expect(['not', 'me@', '@', 'a@b', 'x@@y.com'].some(validAllowed)).toBe(false);
	});
});

describe('signupRules', () => {
	const none = { signupMode: null, allowedEmails: null };

	it('follows the saved setting', () => {
		expect(signupRules({ signupMode: 'list', allowedEmails: 'a@b.com\n@c.org' }, {})).toEqual({ mode: 'list', list: ['a@b.com', '@c.org'], from: 'app' });
		expect(signupRules({ signupMode: 'admin', allowedEmails: 'a@b.com' }, { OPEN_SIGNUP: 'true' })).toEqual({ mode: 'admin', list: [], from: 'app' });
		expect(signupRules({ signupMode: 'open', allowedEmails: null }, {})).toMatchObject({ mode: 'open', from: 'app' });
	});

	it('falls back to the environment on servers from before, until one is saved', () => {
		expect(signupRules(none, { OPEN_SIGNUP: 'true' })).toMatchObject({ mode: 'open', from: 'env' });
		expect(signupRules(none, { ALLOWED_EMAILS: 'a@b.com,@c.org' })).toEqual({ mode: 'list', list: ['a@b.com', '@c.org'], from: 'env' });
		expect(signupRules(none, {})).toEqual({ mode: 'admin', list: [], from: 'app' });
	});
});

describe('listAllows', () => {
	it('lets in an address, or everyone at a domain', () => {
		const list = ['friend@example.com', '@family.example'];
		expect(listAllows(list, 'Friend@Example.com')).toBe(true);
		expect(listAllows(list, 'kid@family.example')).toBe(true);
		expect(listAllows(list, 'kid@notfamily.example')).toBe(false);
		expect(listAllows(list, 'someone@example.com')).toBe(false);
	});
});
