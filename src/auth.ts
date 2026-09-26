import { skipCSRFCheck } from '@auth/core';
import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/sveltekit/providers/credentials';
import Google from '@auth/sveltekit/providers/google';
import type { Provider } from '@auth/sveltekit/providers';
import { env } from '$env/dynamic/private';
import { verifyPassword } from '$lib/server/password';
import { isEmailAllowed, LOCAL_ADMIN_FALLBACK_EMAIL, upsertUser } from '$lib/server/users';

export const googleEnabled = () => Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
export const localAdminEnabled = () => Boolean(env.LOCAL_ADMIN_PASSWORD_HASH);
/** Test-only sign-in that stands in for Google. Never enable on a real server. */
export const devLoginEnabled = () => env.AUTH_DEV_LOGIN === 'true';

function providers(): Provider[] {
	const list: Provider[] = [];
	if (googleEnabled()) list.push(Google);
	if (localAdminEnabled()) {
		list.push(
			Credentials({
				id: 'local',
				name: 'Local admin',
				credentials: { username: {}, password: {} },
				authorize(c) {
					const username = String(c.username ?? '').trim();
					const password = String(c.password ?? '');
					const expectedUser = env.LOCAL_ADMIN_USERNAME?.trim() || 'admin';
					if (username !== expectedUser) return null;
					if (!verifyPassword(password, env.LOCAL_ADMIN_PASSWORD_HASH!)) return null;
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

if (devLoginEnabled()) {
	console.warn('[waterline] AUTH_DEV_LOGIN is on: anyone can sign in as any email. Test use only.');
}

export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
	providers: providers(),
	trustHost: true,
	// SvelteKit already rejects cross-origin form posts (csrf.checkOrigin), which
	// covers /auth/* too; Auth.js's own token can't be passed by server-side signIn().
	skipCSRFCheck,
	session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 90 },
	pages: { signIn: '/signin', error: '/signin' },
	callbacks: {
		signIn({ account, profile }) {
			if (account?.provider === 'google') {
				return Boolean(profile?.email && profile.email_verified !== false && isEmailAllowed(profile.email));
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
