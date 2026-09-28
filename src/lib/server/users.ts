import { and, eq, isNull } from 'drizzle-orm';
import { VERSION } from '$lib/changelog';
import { db } from './db';
import { assistantTokens, calendarFeeds, exports, imports, notificationPrefs, products, pushSubscriptions, tanks, users, type User } from './db/schema';
import { logger } from './log';
import { getServerSettings } from './mail';
import { adminEmail, listAllows, signupRules } from './sign-in';

/** Email used for the local admin account when no admin email is set. */
export const LOCAL_ADMIN_FALLBACK_EMAIL = 'admin@localhost';

/**
 * Who may sign in (Server settings › Sign-in): the admin, and the people or
 * @domains on the list, or anyone with a Google account. Checked at sign-in and
 * on every request, so removing someone locks them out.
 */
export function isEmailAllowed(email: string): boolean {
	const e = email.trim().toLowerCase();
	if (e === adminEmail() || e === LOCAL_ADMIN_FALLBACK_EMAIL) return true;
	const rules = signupRules(getServerSettings());
	if (rules.mode === 'open' || listAllows(rules.list, e)) return true;
	// an admin always can, so changing the admin's address never locks them out
	return !!db.select({ id: users.id }).from(users).where(and(eq(users.email, e), eq(users.isAdmin, true))).get();
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
 * One account from two: the admin's Google account was used before 1.8.3
 * and made a new one, away from the local admin's tanks. The local admin's
 * account stays (its tanks, settings and History); what the new one has
 * (tanks, saved products, devices, assistant tokens) moves into it, and the
 * new one's Google sign-in and address with them.
 */
function joinAccounts(keep: User, from: User): User {
	const joined = db.transaction((tx) => {
		for (const t of [tanks, products, imports, exports, assistantTokens, pushSubscriptions]) {
			tx.update(t).set({ userId: keep.id }).where(eq(t.userId, from.id)).run();
		}
		// one calendar feed each: the kept account's, or the other's when it has none
		if (!tx.select({ t: calendarFeeds.token }).from(calendarFeeds).where(eq(calendarFeeds.userId, keep.id)).get()) {
			tx.update(calendarFeeds).set({ userId: keep.id }).where(eq(calendarFeeds.userId, from.id)).run();
		}
		tx.delete(users).where(eq(users.id, from.id)).run();
		return tx
			.update(users)
			.set({
				email: from.email,
				googleSub: from.googleSub,
				isAdmin: true,
				// the local admin login's "Admin" gives way to their name on Google
				...(keep.displayName === 'Admin' && from.displayName ? { displayName: from.displayName } : {})
			})
			.where(eq(users.id, keep.id))
			.returning()
			.get();
	});
	logger.info('sign-in', `The admin's Google account ${from.email} joined to the local admin's account`, { userId: keep.id });
	return joined;
}

/**
 * Find or create the user for a sign-in. Google users are matched by their
 * stable `sub` first, then by email (so the local admin login and Google share
 * one account when ADMIN_EMAIL matches). The admin's Google account, the first
 * time it's used, takes over the local admin's account from before it was set
 * (admin@localhost), so the admin's tanks come with them.
 */
export function upsertUser(input: { email: string; name?: string | null; googleSub?: string | null }): User {
	const email = input.email.trim().toLowerCase();
	const isAdmin = email === adminEmail() || email === LOCAL_ADMIN_FALLBACK_EMAIL;

	let user =
		(input.googleSub
			? db.select().from(users).where(eq(users.googleSub, input.googleSub)).get()
			: undefined) ?? db.select().from(users).where(eq(users.email, email)).get();

	// the local admin's account from before the admin's Google account was set:
	// nobody can sign in to it any more, so it becomes the admin's
	if (isAdmin && email !== LOCAL_ADMIN_FALLBACK_EMAIL) {
		const local = db
			.select()
			.from(users)
			.where(and(eq(users.email, LOCAL_ADMIN_FALLBACK_EMAIL), isNull(users.googleSub)))
			.get();
		if (local && !user) user = db.update(users).set({ email }).where(eq(users.id, local.id)).returning().get();
		else if (local && user && user.id !== local.id) user = joinAccounts(local, user);
	}

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
