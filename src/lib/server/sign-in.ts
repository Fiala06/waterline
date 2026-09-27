// How people sign in, as the admin set it in Server settings. Servers from
// before these settings keep their environment variables (AUTH_GOOGLE_ID,
// AUTH_GOOGLE_SECRET, ADMIN_EMAIL, ALLOWED_EMAILS, OPEN_SIGNUP,
// LOCAL_ADMIN_PASSWORD_HASH, LOCAL_ADMIN_USERNAME) until the same setting is
// saved in the app. LOCAL_ADMIN_PASSWORD_HASH always works, as a way back in.
import { and, eq, isNotNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { users } from './db/schema';
import { getServerSettings } from './mail';
import { isValidPasswordHash } from './password';
import { decrypt } from './secrets';

export { listAllows, parseAllowed, signupRules, validAllowed, type SignupMode } from './sign-in-rules';

/** The Google account that becomes the admin. */
export function adminEmail(): string | null {
	return (getServerSettings().adminEmail || env.ADMIN_EMAIL || '').trim().toLowerCase() || null;
}

/** The Google OAuth client, saved in the app or from the environment. */
export function googleClient(): { clientId: string; clientSecret: string; from: 'app' | 'env' } | null {
	const s = getServerSettings();
	const secret = decrypt(s.googleClientSecretEnc);
	if (s.googleClientId && secret) return { clientId: s.googleClientId, clientSecret: secret, from: 'app' };
	if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) return { clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET, from: 'env' };
	return null;
}

/** The local admin login: its username, and each password that opens it (the app's, and LOCAL_ADMIN_PASSWORD_HASH). */
export function localAdminLogin(): { username: string; hashes: string[]; fromApp: boolean; fromEnv: boolean } | null {
	const s = getServerSettings();
	const app = s.localAdminPasswordHash && isValidPasswordHash(s.localAdminPasswordHash) ? s.localAdminPasswordHash : null;
	const fromEnv = env.LOCAL_ADMIN_PASSWORD_HASH && isValidPasswordHash(env.LOCAL_ADMIN_PASSWORD_HASH) ? env.LOCAL_ADMIN_PASSWORD_HASH : null;
	const hashes = [app, fromEnv].filter((h): h is string => !!h);
	if (!hashes.length) return null;
	return { username: s.localAdminUsername || env.LOCAL_ADMIN_USERNAME?.trim() || 'admin', hashes, fromApp: !!app, fromEnv: !!fromEnv };
}

/** An admin could sign in with Google: it's set up, for the admin's address or an admin who signed in with it before. */
export function googleAdminPossible(): boolean {
	if (!googleClient()) return false;
	if (adminEmail()) return true;
	return !!db.select({ id: users.id }).from(users).where(and(eq(users.isAdmin, true), isNotNull(users.googleSub))).get();
}
