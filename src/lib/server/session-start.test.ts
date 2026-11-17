import { describe, expect, it } from 'vitest';
import { sessionStart, stampSessionStart } from './session-start';

describe('when a session began (#27, #291)', () => {
	it('is now when signing in, and stays put after', () => {
		const t = stampSessionStart({ iat: 50 }, true, 1000);
		expect(t.signedInAt).toBe(1000);
		expect(stampSessionStart({ ...t, iat: 2000 }, false, 3000).signedInAt).toBe(1000);
	});

	it('a session from before it was kept takes the iat it came with, once, and never a renewed one', () => {
		const old = stampSessionStart({ iat: 500 } as { iat: number; signedInAt?: number }, false, 9000);
		expect(old.signedInAt).toBe(500);
		// re-signed since: a later iat changes nothing
		expect(stampSessionStart({ ...old, iat: 8000 }, false, 9000).signedInAt).toBe(500);
		expect(stampSessionStart({}, false, 9000).signedInAt).toBe(0);
	});

	it('read back without one, it began long ago', () => {
		expect(sessionStart({ signedInAt: 42 })).toBe(42);
		expect(sessionStart({})).toBe(0);
	});
});
