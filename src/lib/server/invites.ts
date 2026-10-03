// Invitations to the server (#27): the admin invites an email address, and an
// email (or a copied link) carries the Accept link, good for 7 days. Accepting
// is signing in with Google as that address; from then on the invite lets it
// in (Who can sign in: Invited people only, or beside a list) until it's
// revoked. The raw token lives only in the link; the database keeps its hash.
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { invites, users, type Invite } from './db/schema';

export const INVITE_DAYS = 7;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const now = () => new Date().toISOString();
const norm = (email: string) => email.trim().toLowerCase();

export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** A new invitation for an address (a pending one for the same address is replaced). The token goes in the link. */
export function createInvite(email: string, invitedBy: string | null): { invite: Invite; token: string } {
	const e = norm(email);
	db.update(invites).set({ revokedAt: now() }).where(and(eq(invites.email, e), isNull(invites.acceptedAt), isNull(invites.revokedAt))).run();
	const token = randomBytes(24).toString('base64url');
	const invite = db
		.insert(invites)
		.values({ email: e, tokenHash: hash(token), invitedBy, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() })
		.returning()
		.get();
	return { invite, token };
}

export type InviteState = 'pending' | 'accepted' | 'expired' | 'revoked';

export function inviteState(i: Invite, at = now()): InviteState {
	if (i.revokedAt) return 'revoked';
	if (i.acceptedAt) return 'accepted';
	if (i.expiresAt < at) return 'expired';
	return 'pending';
}

/** The invite behind an Accept link, with who sent it. */
export function readInvite(token: string) {
	const row = db
		.select({ invite: invites, inviter: users.displayName })
		.from(invites)
		.leftJoin(users, eq(users.id, invites.invitedBy))
		.where(eq(invites.tokenHash, hash(token)))
		.get();
	return row ? { ...row, state: inviteState(row.invite) } : null;
}

/** Whether an invitation lets this address sign in: accepted and not revoked, or still pending. */
export function inviteAllows(email: string): boolean {
	const e = norm(email);
	const at = now();
	return db
		.select()
		.from(invites)
		.where(and(eq(invites.email, e), isNull(invites.revokedAt)))
		.all()
		.some((i) => i.acceptedAt || i.expiresAt >= at);
}

/** Signing in as an invited address accepts its pending invitation. */
export function acceptInvite(email: string, userId: string): Invite | null {
	const e = norm(email);
	const pending = db
		.select()
		.from(invites)
		.where(and(eq(invites.email, e), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
		.orderBy(desc(invites.createdAt))
		.get();
	if (!pending || pending.expiresAt < now()) return null;
	return db.update(invites).set({ acceptedAt: now(), acceptedUserId: userId }).where(eq(invites.id, pending.id)).returning().get();
}

/** Every invitation, newest first, with the state it's in and who sent it. */
export function listInvites() {
	return db
		.select({ invite: invites, inviter: users.displayName })
		.from(invites)
		.leftJoin(users, eq(users.id, invites.invitedBy))
		.orderBy(desc(invites.createdAt))
		.all()
		.map((r) => ({ ...r, state: inviteState(r.invite) }));
}

export function getInvite(id: string): Invite | undefined {
	return db.select().from(invites).where(eq(invites.id, id)).get();
}

/** Revoking: a pending link stops working; an accepted invite stops letting the address in (they're signed out on their next request). */
export function revokeInvite(id: string): Invite | undefined {
	return db.update(invites).set({ revokedAt: now() }).where(and(eq(invites.id, id), isNull(invites.revokedAt))).returning().get();
}

/** Resend: a fresh link and another 7 days for the same address. */
export function resendInvite(id: string, invitedBy: string | null) {
	const old = getInvite(id);
	if (!old) return null;
	return createInvite(old.email, invitedBy);
}
