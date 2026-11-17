// When a session began, for Sign out everywhere (#27): kept on the session's
// token itself, since Auth.js re-signs the cookie on every request and its `iat`
// is only the last request's time.

/**
 * The token with when its session began: now when signing in; for a session
 * from before this was kept (#291), the `iat` it came with, read before it's
 * renewed, so a Sign out everywhere after it still holds (none: long ago).
 */
export function stampSessionStart<T extends Record<string, unknown>>(token: T, signingIn: boolean, nowS = Math.floor(Date.now() / 1000)): T & { signedInAt: number } {
	if (typeof token.signedInAt === 'number') return token as T & { signedInAt: number };
	const signedInAt = signingIn ? nowS : typeof token.iat === 'number' ? token.iat : 0;
	return Object.assign(token, { signedInAt });
}

/** When the session began, as the hooks compare it with Sign out everywhere: never `iat` (#291). */
export const sessionStart = (token: Record<string, unknown>): number => (typeof token.signedInAt === 'number' ? token.signedInAt : 0);
