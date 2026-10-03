import { skipCSRFCheck } from '@auth/core';
import { SvelteKitAuth } from '@auth/sveltekit';
import type { RequestEvent } from '@sveltejs/kit';
import Credentials from '@auth/sveltekit/providers/credentials';
import Google from '@auth/sveltekit/providers/google';
import type { Provider } from '@auth/sveltekit/providers';
import { env } from '$env/dynamic/private';
import { copyGoogleAvatar } from '$lib/server/avatar';
import { authSecret } from '$lib/server/instance';
import { logger } from '$lib/server/log';
import { isValidPasswordHash, verifyPassword } from '$lib/server/password';
import { adminEmail, googleClient, localAdminLogin } from '$lib/server/sign-in';
import { acceptInvite } from '$lib/server/invites';
import { googleAccountConflict, isEmailAllowed, LOCAL_ADMIN_FALLBACK_EMAIL, upsertUser } from '$lib/server/users';

/** Google sign-in is on once its client is set, in Server settings (or the environment). */
export const googleEnabled = () => googleClient() !== null;
/** The local admin login is on once it has a password: set in the app, or LOCAL_ADMIN_PASSWORD_HASH. */
export const localAdminEnabled = () => localAdminLogin() !== null;
/** Test-only sign-in that stands in for Google. Never enable on a real server. */
export const devLoginEnabled = () => env.AUTH_DEV_LOGIN === 'true';

/** Called at startup: refuse settings that would let anyone in, and explain ones that are ignored. */
export function checkAuthConfig() {
	if (devLoginEnabled() && process.env.NODE_ENV === 'production') {
		throw new Error('AUTH_DEV_LOGIN=true lets anyone sign in as anyone, so it is refused when NODE_ENV=production.');
	}
	if (devLoginEnabled()) logger.warn('server', 'AUTH_DEV_LOGIN is on: anyone can sign in as any email. Test use only.');
	const origin = env.ORIGIN?.trim() ?? '';
	if (origin.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(origin)) {
		logger.warn('server', 'ORIGIN is plain http. Fine for a LAN-only server, but Google sign-in, offline logging and the install prompt need HTTPS.');
	}
	if (env.LOCAL_ADMIN_PASSWORD_HASH && !isValidPasswordHash(env.LOCAL_ADMIN_PASSWORD_HASH)) {
		logger.error('server', "LOCAL_ADMIN_PASSWORD_HASH isn't a valid hash, so it's ignored. Create one with: hash-password (in the Docker container) or npm run hash-password");
	}
}

function providers(): Provider[] {
	const list: Provider[] = [];
	const google = googleClient();
	if (google) list.push(Google({ clientId: google.clientId, clientSecret: google.clientSecret }));
	const local = localAdminLogin();
	if (local) {
		list.push(
			Credentials({
				id: 'local',
				name: 'Local admin',
				credentials: { username: {}, password: {} },
				async authorize(c) {
					const username = String(c.username ?? '').trim();
					const password = String(c.password ?? '').slice(0, 1024);
					// every password is checked, and before the username, so a wrong one takes just as long
					const checks = await Promise.all(local.hashes.map((h) => verifyPassword(password, h)));
					// Any capitalization: phone keyboards turn "admin" into "Admin".
					if (!checks.some(Boolean) || username.toLowerCase() !== local.username.toLowerCase()) return null;
					const email = adminEmail() || LOCAL_ADMIN_FALLBACK_EMAIL;
					const user = upsertUser({ email, name: 'Admin' });
					logger.info('sign-in', 'Signed in with the local admin login', { userId: user.id });
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
					// as Google sign-in does: signing in as an invited address accepts the invitation (#27)
					if (acceptInvite(user.email, user.id)) logger.info('sign-in', `${user.email} accepted their invitation`, { userId: user.id });
					return { id: user.id, email: user.email, name: user.displayName };
				}
			})
		);
	}
	return list;
}

export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
	providers: providers(),
	// AUTH_SECRET, or the key this server made for itself on first start
	secret: authSecret(),
	trustHost: true,
	// hooks.server.ts rejects cross-origin posts, which covers /auth/* too;
	// Auth.js's own CSRF token can't be passed by the server-side signIn().
	skipCSRFCheck,
	session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 90 },
	pages: { signIn: '/signin', error: '/signin' },
	logger: {
		error(error) {
			// a wrong password is logged where it's typed, on the sign-in page
			if (error.name !== 'CredentialsSignin') logger.error('sign-in', `Sign-in failed (${error.name})`, { error });
		},
		warn(code) {
			logger.warn('sign-in', `Sign-in warning: ${code}`);
		},
		debug() {}
	},
	callbacks: {
		signIn({ account, profile }) {
			if (account?.provider === 'google') {
				if (!profile?.email || profile.email_verified === false) {
					logger.warn('sign-in', 'Google sign-in refused: the account has no verified email address');
					return false;
				}
				if (!isEmailAllowed(profile.email)) {
					logger.warn('sign-in', `Google sign-in refused: ${profile.email} isn't allowed on this server`);
					return false;
				}
				// An address that now belongs to a different Google account doesn't get the old owner's data.
				if (googleAccountConflict(profile.email, account.providerAccountId)) {
					logger.warn('sign-in', `Google sign-in refused: ${profile.email} belongs to a different Google account now`);
					return false;
				}
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
				logger.info('sign-in', 'Signed in with Google', { userId: u.id });
				// an invited address (#27): signing in accepts the invitation
				if (acceptInvite(u.email, u.id)) logger.info('sign-in', `${u.email} accepted their invitation`, { userId: u.id });
				// the account's photo, copied in the background (initials until then)
				if (typeof profile.picture === 'string') void copyGoogleAvatar(u.id, profile.picture);
				token.uid = u.id;
			} else if (user?.id) {
				token.uid = user.id;
			}
			return token;
		},
		session({ session, token }) {
			if (token.uid) session.user.id = token.uid as string;
			// when this session began, for Sign out everywhere (#27)
			if (typeof token.iat === 'number') (session.user as { signedInAt?: number }).signedInAt = token.iat;
			return session;
		}
	}
}));

/** Sign in from a form action: Auth.js sees the provider, its credentials and where to go next. */
export function signInWith(event: RequestEvent, providerId: string, fields: Record<string, string>, redirectTo: string) {
	const body = new FormData();
	body.set('providerId', providerId);
	body.set('redirectTo', redirectTo);
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const headers = new Headers(event.request.headers);
	headers.delete('content-type');
	headers.delete('content-length');
	return signIn({ ...event, request: new Request(event.request.url, { method: 'POST', body, headers }) });
}
