import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { notificationPrefs, users, type User } from './db/schema';

const adminEmail = () => env.ADMIN_EMAIL?.trim().toLowerCase() || null;

/**
 * Optional sign-up allowlist: ALLOWED_EMAILS="me@example.com,@family.example".
 * Entries starting with @ allow a whole domain. Unset = anyone can sign in.
 * The admin email is always allowed.
 */
export function isEmailAllowed(email: string): boolean {
	const list = (env.ALLOWED_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	if (!list.length) return true;
	const e = email.trim().toLowerCase();
	if (e === adminEmail()) return true;
	return list.some((entry) => (entry.startsWith('@') ? e.endsWith(entry) : e === entry));
}

/** Email used for the local admin account when ADMIN_EMAIL is not set. */
export const LOCAL_ADMIN_FALLBACK_EMAIL = 'admin@localhost';

/**
 * Find or create the user for a sign-in. Google users are matched by their
 * stable `sub` first, then by email (so the local admin login and Google share
 * one account when ADMIN_EMAIL matches).
 */
export function upsertUser(input: { email: string; name?: string | null; googleSub?: string | null }): User {
	const email = input.email.trim().toLowerCase();
	const isAdmin = email === adminEmail() || email === LOCAL_ADMIN_FALLBACK_EMAIL;

	let user =
		(input.googleSub
			? db.select().from(users).where(eq(users.googleSub, input.googleSub)).get()
			: undefined) ?? db.select().from(users).where(eq(users.email, email)).get();

	if (!user) {
		user = db
			.insert(users)
			.values({
				email,
				displayName: input.name?.trim() || email.split('@')[0],
				googleSub: input.googleSub ?? null,
				isAdmin
			})
			.returning()
			.get();
		db.insert(notificationPrefs).values({ userId: user.id }).run();
		return user;
	}

	const patch: Partial<User> = {};
	if (input.googleSub && !user.googleSub) patch.googleSub = input.googleSub;
	if (isAdmin && !user.isAdmin) patch.isAdmin = true;
	if (Object.keys(patch).length) {
		user = db.update(users).set(patch).where(eq(users.id, user.id)).returning().get();
	}
	return user;
}

export function getUser(id: string): User | undefined {
	return db.select().from(users).where(eq(users.id, id)).get();
}

export function updateUser(id: string, patch: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>) {
	return db.update(users).set(patch).where(eq(users.id, id)).returning().get();
}
