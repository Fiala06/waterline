import { skipCSRFCheck } from '@auth/core';
import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/sveltekit/providers/credentials';
import Google from '@auth/sveltekit/providers/google';
import type { Provider } from '@auth/sveltekit/providers';
import { env } from '$env/dynamic/private';
import { isValidPasswordHash, verifyPassword } from '$lib/server/password';
import { googleAccountConflict, isEmailAllowed, LOCAL_ADMIN_FALLBACK_EMAIL, upsertUser } from '$lib/server/users';

export const googleEnabled = () => Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
/** The local admin login is on when a valid LOCAL_ADMIN_PASSWORD_HASH is set. */
export const localAdminEnabled = () => Boolean(env.LOCAL_ADMIN_PASSWORD_HASH && isValidPasswordHash(env.LOCAL_ADMIN_PASSWORD_HASH));
/** Test-only sign-in that stands in for Google. Never enable on a real server. */
export const devLoginEnabled = () => env.AUTH_DEV_LOGIN === 'true';

/** Called at startup: refuse settings that would let anyone in, and explain ones that are ignored. */
export function checkAuthConfig() {
	if (devLoginEnabled() && process.env.NODE_ENV === 'production') {
		throw new Error('AUTH_DEV_LOGIN=true lets anyone sign in as anyone, so it is refused when NODE_ENV=production.');
	}
	if (devLoginEnabled()) console.warn('[waterline] AUTH_DEV_LOGIN is on: anyone can sign in as any email. Test use only.');
	const origin = env.ORIGIN?.trim() ?? '';
	if (origin.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(origin)) {
		console.warn('[waterline] ORIGIN is plain http. Fine for a LAN-only server, but Google sign-in, offline logging and the install prompt need HTTPS.');
	}
	if (env.LOCAL_ADMIN_PASSWORD_HASH && !localAdminEnabled()) {
		console.error("[waterline] LOCAL_ADMIN_PASSWORD_HASH isn't a valid hash, so the local admin login is off. Create one with: hash-password (in the Docker container) or npm run hash-password");
	}
}

function providers(): Provider[] {
	const list: Provider[] = [];
	if (googleEnabled()) list.push(Google);
	if (localAdminEnabled()) {
		list.push(
			Credentials({
				id: 'local',
				name: 'Local admin',
				credentials: { username: {}, password: {} },
				async authorize(c) {
					const username = String(c.username ?? '').trim();
					const password = String(c.password ?? '').slice(0, 1024);
					const expectedUser = env.LOCAL_ADMIN_USERNAME?.trim() || 'admin';
					// check the password first, so a wrong username takes just as long
					const ok = await verifyPassword(password, env.LOCAL_ADMIN_PASSWORD_HASH!);
					if (!ok || username !== expectedUser) return null;
					const email = env.ADMIN_EMAIL?.trim() || LOCAL_ADMIN_FALLBACK_EMAIL;
					const user = upsertUser({ email, name: 'Admin' });
					return { id: user.id, email: user.email, name: user.displayName };
				}
			})
		);
	}
	if (devLoginEnabled()) {
		list.push(
			Credentials({
				id: 'dev',
				name: 'Mock Google',
				credentials: { email: {}, name: {} },
				authorize(c) {
					const email = String(c.email ?? '').trim();
					if (!email.includes('@')) return null;
					const user = upsertUser({ email, name: String(c.name ?? '') || null });
					return { id: user.id, email: user.email, name: user.displayName };
				}
			})
		);
	}
	return list;
}

export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
	providers: providers(),
	trustHost: true,
	// hooks.server.ts rejects cross-origin posts, which covers /auth/* too;
	// Auth.js's own CSRF token can't be passed by the server-side signIn().
	skipCSRFCheck,
	session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 90 },
	pages: { signIn: '/signin', error: '/signin' },
	callbacks: {
		signIn({ account, profile }) {
			if (account?.provider === 'google') {
				if (!profile?.email || profile.email_verified === false || !isEmailAllowed(profile.email)) return false;
				// An address that now belongs to a different Google account doesn't get the old owner's data.
				return !googleAccountConflict(profile.email, account.providerAccountId);
			}
			return true;
		},
		jwt({ token, user, account, profile }) {
			if (account?.provider === 'google' && profile?.email) {
				const u = upsertUser({
					email: profile.email,
					name: profile.name,
					googleSub: account.providerAccountId
				});
				token.uid = u.id;
			} else if (user?.id) {
				token.uid = user.id;
			}
			return token;
		},
		session({ session, token }) {
			if (token.uid) session.user.id = token.uid as string;
			return session;
		}
	}
}));
