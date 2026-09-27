import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { VERSION } from '$lib/changelog';
import { db } from './db';
import { notificationPrefs, users, type User } from './db/schema';

const adminEmail = () => env.ADMIN_EMAIL?.trim().toLowerCase() || null;

/** Email used for the local admin account when ADMIN_EMAIL is not set. */
export const LOCAL_ADMIN_FALLBACK_EMAIL = 'admin@localhost';

/**
 * Who may sign in: the admin, plus ALLOWED_EMAILS="me@example.com,@family.example"
 * (entries starting with @ allow a whole domain), or anyone with OPEN_SIGNUP=true.
 * Checked at sign-in and on every request, so removing someone locks them out.
 */
export function isEmailAllowed(email: string): boolean {
	if (env.OPEN_SIGNUP === 'true') return true;
	const e = email.trim().toLowerCase();
	if (e === adminEmail() || e === LOCAL_ADMIN_FALLBACK_EMAIL) return true;
	const list = (env.ALLOWED_EMAILS ?? '')
		.split(',')
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);
	return list.some((entry) => (entry.startsWith('@') ? e.endsWith(entry) : e === entry));
}

/**
 * True when this email belongs to an account linked to a different Google
 * account, e.g. a work address that was given to someone new.
 */
export function googleAccountConflict(email: string, googleSub: string): boolean {
	if (db.select({ id: users.id }).from(users).where(eq(users.googleSub, googleSub)).get()) return false;
	const byEmail = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
	return Boolean(byEmail?.googleSub && byEmail.googleSub !== googleSub);
}

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
				isAdmin,
				// nothing new to them yet
				seenVersion: VERSION
			})
			.returning()
			.get();
		db.insert(notificationPrefs).values({ userId: user.id }).run();
		return user;
	}

	if (input.googleSub && user.googleSub && user.googleSub !== input.googleSub) {
		throw new Error('This email belongs to another Google account');
	}
	const patch: Partial<User> = {};
	if (input.googleSub && !user.googleSub) patch.googleSub = input.googleSub;
	// the Google account's address changed: keep ours in step, unless another account has it
	if (input.googleSub && user.email !== email && !db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
		patch.email = email;
	}
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
