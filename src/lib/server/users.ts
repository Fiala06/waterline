import { and, eq, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { VERSION } from '$lib/changelog';
import { db } from './db';
import {
	assistantTokens,
	calendarFeeds,
	emailLog,
	events,
	exports,
	imports,
	invites,
	logs,
	notificationPrefs,
	oauthCodes,
	products,
	quickFavorites,
	pushSubscriptions,
	tankMembers,
	tanks,
	testKits,
	tests,
	users,
	type User
} from './db/schema';
import { inviteAllows } from './invites';
import { logger } from './log';
import { getServerSettings } from './mail';
import { adminEmail, listAllows, signupRules } from './sign-in';

/** Email used for the local admin account when no admin email is set. */
export const LOCAL_ADMIN_FALLBACK_EMAIL = 'admin@localhost';

/**
 * Who may sign in (Server settings › Sign-in): the admin, and the people or
 * @domains on the list, people with an invitation (#27), or anyone with a
 * Google account. Checked at sign-in and on every request, so removing
 * someone, or revoking their invitation, locks them out.
 */
export function isEmailAllowed(email: string): boolean {
	const e = email.trim().toLowerCase();
	if (e === adminEmail() || e === LOCAL_ADMIN_FALLBACK_EMAIL) return true;
	const rules = signupRules(getServerSettings());
	if (rules.mode === 'open' || listAllows(rules.list, e)) return true;
	// an invitation counts whenever people besides the admin may sign in at all
	if (rules.mode !== 'admin' && inviteAllows(e)) return true;
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
 * What happens to each column that points at an account when two accounts
 * become one (#112). Every such column is listed (a test reads the schema and
 * fails when one is missing), so a new table can't be lost to the delete's
 * cascade by being forgotten here.
 * - move: the joining account's rows become the kept account's
 * - merge: moved, settling what both have (see joinAccounts)
 * - drop: discarded on purpose
 */
export const USER_LINKS = {
	'tanks.user_id': 'move',
	'products.user_id': 'move',
	'quick_favorites.user_id': 'move',
	'test_kits.user_id': 'move',
	'imports.user_id': 'move',
	'exports.user_id': 'move',
	'assistant_tokens.user_id': 'move',
	'push_subscriptions.user_id': 'move',
	// who logged an entry or test on a shared tank, and the server log's account: no foreign key, kept attributed
	'events.logged_by': 'move',
	'tests.logged_by': 'move',
	'logs.user_id': 'move',
	// who sent or accepted an invitation: history, kept attributed
	'invites.invited_by': 'move',
	'invites.accepted_user_id': 'move',
	'tank_members.invited_by': 'move',
	// access to other keepers' tanks: one active membership per tank, the higher role; none on a tank they now own
	'tank_members.user_id': 'merge',
	// one calendar feed each: the kept account's, or the other's when it has none
	'calendar_feeds.user_id': 'merge',
	// the kept account's notification settings, or the other's when it has none
	'notification_prefs.user_id': 'merge',
	// what's been emailed, so nothing goes twice: the other's, where the kept account hasn't the same
	'email_log.user_id': 'merge',
	// sign-in codes for an AI assistant live for minutes and are used once: that sign-in starts again
	'oauth_codes.user_id': 'drop'
} as const;

const RANK = { view: 0, log: 1 } as const;

/**
 * One account from two: the admin's Google account was used before 1.8.3
 * and made a new one, away from the local admin's tanks. The local admin's
 * account stays (its tanks, settings and History); everything the new one
 * has moves into it as USER_LINKS says, in one transaction, and the new
 * one's Google sign-in and address with them.
 */
function joinAccounts(keep: User, from: User): User {
	const joined = db.transaction((tx) => {
		const at = new Date().toISOString();
		const moved = (t: typeof tanks | typeof products | typeof quickFavorites | typeof testKits | typeof imports | typeof exports | typeof assistantTokens | typeof pushSubscriptions | typeof logs) =>
			tx.update(t).set({ userId: keep.id }).where(eq(t.userId, from.id)).run();
		for (const t of [tanks, products, quickFavorites, testKits, imports, exports, assistantTokens, pushSubscriptions, logs]) moved(t);
		tx.update(events).set({ loggedBy: keep.id }).where(eq(events.loggedBy, from.id)).run();
		tx.update(tests).set({ loggedBy: keep.id }).where(eq(tests.loggedBy, from.id)).run();
		tx.update(invites).set({ invitedBy: keep.id }).where(eq(invites.invitedBy, from.id)).run();
		tx.update(invites).set({ acceptedUserId: keep.id }).where(eq(invites.acceptedUserId, from.id)).run();
		tx.update(tankMembers).set({ invitedBy: keep.id }).where(eq(tankMembers.invitedBy, from.id)).run();

		// memberships: the kept account owns every tank either owned, and has one active membership per other tank
		const owned = new Set(tx.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, keep.id)).all().map((t) => t.id));
		const active = (m: { acceptedAt: string | null; revokedAt: string | null }) => !!m.acceptedAt && !m.revokedAt;
		for (const m of tx.select().from(tankMembers).where(eq(tankMembers.userId, from.id)).all()) {
			const patch: Partial<typeof tankMembers.$inferInsert> = { userId: keep.id };
			if (active(m)) {
				const theirs = tx
					.select()
					.from(tankMembers)
					.where(and(eq(tankMembers.tankId, m.tankId), eq(tankMembers.userId, keep.id), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
					.get();
				if (owned.has(m.tankId)) patch.revokedAt = at;
				else if (theirs) {
					// one active membership: the kept one, with the higher of the two roles
					if (RANK[m.role] > RANK[theirs.role]) tx.update(tankMembers).set({ role: m.role }).where(eq(tankMembers.id, theirs.id)).run();
					patch.revokedAt = at;
				}
			}
			tx.update(tankMembers).set(patch).where(eq(tankMembers.id, m.id)).run();
		}
		// and none left on a tank the kept account owns
		if (owned.size)
			tx.update(tankMembers)
				.set({ revokedAt: at })
				.where(and(eq(tankMembers.userId, keep.id), inArray(tankMembers.tankId, [...owned]), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
				.run();

		if (!tx.select({ t: calendarFeeds.token }).from(calendarFeeds).where(eq(calendarFeeds.userId, keep.id)).get()) {
			tx.update(calendarFeeds).set({ userId: keep.id }).where(eq(calendarFeeds.userId, from.id)).run();
		}
		if (!tx.select({ u: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.userId, keep.id)).get()) {
			tx.update(notificationPrefs).set({ userId: keep.id }).where(eq(notificationPrefs.userId, from.id)).run();
		}
		const sent = tx.select({ key: emailLog.key }).from(emailLog).where(eq(emailLog.userId, keep.id)).all().map((r) => r.key);
		tx.update(emailLog)
			.set({ userId: keep.id })
			.where(sent.length ? and(eq(emailLog.userId, from.id), notInArray(emailLog.key, sent)) : eq(emailLog.userId, from.id))
			.run();
		tx.delete(oauthCodes).where(eq(oauthCodes.userId, from.id)).run();

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

// ── Alerts read state (the bell): kept on the account, so every device agrees ──

/** At most this many keys are kept; older ones fall off, and those alerts are long gone anyway. */
export const ALERTS_SEEN_CAP = 300;

/** The alert keys this person has marked read, oldest first. */
export function alertsSeen(user: Pick<User, 'alertsSeen'>): string[] {
	try {
		const v = JSON.parse(user.alertsSeen || '[]');
		return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
	} catch {
		return [];
	}
}

/** Merge newly read alert keys into the account's list (capped at the newest 300). */
export function markAlertsSeen(userId: string, keys: string[]): string[] {
	const user = getUser(userId);
	if (!user) return [];
	const seen = [...new Set([...alertsSeen(user), ...keys])].slice(-ALERTS_SEEN_CAP);
	db.update(users).set({ alertsSeen: JSON.stringify(seen) }).where(eq(users.id, userId)).run();
	return seen;
}
