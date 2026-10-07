// People on the server (#27): everyone with an account, for Server settings ›
// People, and what an admin can do about them.
import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { invites, photos, tanks, users, type User } from './db/schema';
import { logger } from './log';
import { adminEmail } from './sign-in';
import { LOCAL_ADMIN_FALLBACK_EMAIL } from './users';

export type SignInKind = 'google' | 'local' | 'invited' | 'none';

/** How a person signs in: their Google account, the local admin login, or an invitation they accepted but haven't used with Google yet. */
export function signInKind(u: User, acceptedInvite: boolean): SignInKind {
	if (u.googleSub) return 'google';
	if (u.email === LOCAL_ADMIN_FALLBACK_EMAIL || u.email === adminEmail()) return 'local';
	return acceptedInvite ? 'invited' : 'none';
}

export function listPeople() {
	const tankCounts = new Map(
		db
			.select({ userId: tanks.userId, n: count() })
			.from(tanks)
			.groupBy(tanks.userId)
			.all()
			.map((r) => [r.userId, r.n])
	);
	const accepted = new Set(
		db
			.select({ email: invites.email })
			.from(invites)
			.where(isNotNull(invites.acceptedAt))
			.all()
			.map((r) => r.email)
	);
	return db
		.select()
		.from(users)
		.orderBy(users.createdAt)
		.all()
		.map((u) => ({ user: u, tanks: tankCounts.get(u.id) ?? 0, signIn: signInKind(u, accepted.has(u.email)) }));
}

export const adminCount = () => db.select({ n: count() }).from(users).where(eq(users.isAdmin, true)).get()?.n ?? 0;

/** Make someone an admin, or no longer one: never the last admin. */
export function setAdmin(by: User, userId: string, isAdmin: boolean): User {
	const u = db.select().from(users).where(eq(users.id, userId)).get();
	if (!u) error(404, 'Person not found');
	if (!isAdmin && u.isAdmin && adminCount() <= 1) error(400, 'The server needs at least one admin.');
	const out = db.update(users).set({ isAdmin }).where(eq(users.id, userId)).returning().get();
	logger.info('settings', isAdmin ? `${u.email} made an admin` : `${u.email} is no longer an admin`, { userId: by.id, person: u.id });
	return out;
}

/** Sign them out on every device: sessions from before now stop working on their next request. */
export function signOutEverywhere(by: User, userId: string): User {
	const u = db.update(users).set({ sessionsRevokedAt: new Date().toISOString() }).where(eq(users.id, userId)).returning().get();
	if (!u) error(404, 'Person not found');
	logger.info('sign-in', `${u.email} signed out everywhere by an admin`, { userId: by.id, person: u.id });
	return u;
}

/** What goes with a person: their tanks and photos, for the confirmation. */
export function personFootprint(userId: string) {
	const ids = db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, userId)).all().map((t) => t.id);
	const photoCount = ids.length ? (db.select({ n: count() }).from(photos).where(inArray(photos.tankId, ids)).get()?.n ?? 0) : 0;
	return { tanks: ids.length, photos: photoCount, tankIds: ids };
}

/** Remove a person and everything of theirs: tanks, entries, photos on disk. Never the last admin, never yourself. */
export function removePerson(by: User, userId: string): User {
	const u = db.select().from(users).where(eq(users.id, userId)).get();
	if (!u) error(404, 'Person not found');
	if (u.id === by.id) error(400, "You can't remove your own account from here.");
	if (u.isAdmin && adminCount() <= 1) error(400, 'The server needs at least one admin.');
	const { tankIds, tanks: n, photos: p } = personFootprint(userId);
	for (const id of tankIds) rmSync(join(env.DATA_DIR ?? './data', 'photos', id), { recursive: true, force: true });
	// their invitation goes too, so the address can't sign back in by itself
	db.update(invites).set({ revokedAt: new Date().toISOString() }).where(and(eq(invites.email, u.email), ne(invites.email, ''))).run();
	db.delete(users).where(eq(users.id, userId)).run(); // cascades to everything else
	logger.info('settings', `${u.email} removed from the server with ${n} tank${n === 1 ? '' : 's'} and ${p} photo${p === 1 ? '' : 's'}`, { userId: by.id });
	return u;
}

/** Someone opened the app: remembered to the quarter hour, so the People list can say when they were last seen. */
export function touchLastSeen(u: User) {
	const last = u.lastSeenAt ? Date.parse(u.lastSeenAt) : 0;
	if (Date.now() - last < 15 * 60_000) return;
	db.update(users).set({ lastSeenAt: new Date().toISOString() }).where(eq(users.id, u.id)).run();
}
