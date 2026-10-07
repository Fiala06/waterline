// Sharing a tank (#22): who can see a tank besides its owner, and what they
// may do. The owner invites someone by email with a role: "log" (tests, water
// changes, dosing, notes, photos and tasks done) or "view" (read-only). Only
// the owner changes setup, targets and sharing, or archives the tank. The
// invite link's token is kept hashed; accepting (signing in as that address)
// fills in the member's user id, and from then the tank is in their list.
import { error } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { tankMembers, tanks, users, type Tank, type TankMember, type TankRole } from './db/schema';

export type Role = 'owner' | TankRole;
const RANK: Record<Role, number> = { view: 0, log: 1, owner: 2 };
export const MEMBER_INVITE_DAYS = 7;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const now = () => new Date().toISOString();
const norm = (email: string) => email.trim().toLowerCase();

/** The tanks shared with this person: accepted and not removed. */
const memberTankIds = (userId: string) =>
	db
		.select({ id: tankMembers.tankId })
		.from(tankMembers)
		.where(and(eq(tankMembers.userId, userId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)));

/** A where clause: tanks this person owns or is a member of. Goes where `eq(tanks.userId, userId)` used to. */
export const visibleTo = (userId: string): SQL => or(eq(tanks.userId, userId), inArray(tanks.id, memberTankIds(userId)))!;

/**
 * A person's one active membership of a tank (#117: the tank_members_active
 * index allows no second; were there two, the higher role, then the first accepted).
 */
function activeMembership(tankId: string, userId: string): TankMember | undefined {
	return db
		.select()
		.from(tankMembers)
		.where(and(eq(tankMembers.tankId, tankId), eq(tankMembers.userId, userId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
		.orderBy(sql`case ${tankMembers.role} when 'log' then 0 else 1 end`, asc(tankMembers.acceptedAt), asc(tankMembers.id))
		.limit(1)
		.get();
}

/** This person's role on a tank, or null when it isn't theirs to see. */
export function tankRole(userId: string, tank: Pick<Tank, 'id' | 'userId'>): Role | null {
	if (tank.userId === userId) return 'owner';
	return activeMembership(tank.id, userId)?.role ?? null;
}

/** This person's role on each of several tanks, in one query (#105); tanks they can't see are left out. */
export function rolesOn(userId: string, list: Pick<Tank, 'id' | 'userId'>[]): Map<string, Role> {
	const out = new Map<string, Role>();
	const others = list.filter((t) => t.userId !== userId).map((t) => t.id);
	for (const t of list) if (t.userId === userId) out.set(t.id, 'owner');
	if (!others.length) return out;
	const rows = db
		.select({ tankId: tankMembers.tankId, role: tankMembers.role })
		.from(tankMembers)
		.where(and(inArray(tankMembers.tankId, others), eq(tankMembers.userId, userId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
		.all();
	// one active membership each; were there two, the higher role, as tankRole decides
	for (const r of rows) if (!out.has(r.tankId) || RANK[r.role] > RANK[out.get(r.tankId)!]) out.set(r.tankId, r.role);
	return out;
}

/** Whether this address (or the account behind it) already has access to the tank. */
export function hasAccess(tankId: string, email: string): boolean {
	const e = norm(email);
	const user = db.select({ id: users.id }).from(users).where(eq(users.email, e)).get();
	if (user && activeMembership(tankId, user.id)) return true;
	return !!db
		.select({ id: tankMembers.id })
		.from(tankMembers)
		.where(and(eq(tankMembers.tankId, tankId), eq(tankMembers.email, e), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
		.get();
}

export const roleAllows = (role: Role | null, need: Role) => role != null && RANK[role] >= RANK[need];

/** What the role can't do: the message a page shows instead of a form. */
export const ROLE_REFUSED: Record<'log' | 'owner', string> = {
	log: 'You can view this tank, not log to it.',
	owner: "Only the tank's owner can change this."
};

/** The same, by tank id. */
export function requireRoleOn(userId: string, tankId: string, need: 'log' | 'owner'): Role {
	const tank = db.select({ id: tanks.id, userId: tanks.userId }).from(tanks).where(eq(tanks.id, tankId)).get();
	if (!tank) error(404, 'Tank not found');
	return requireRole(userId, tank, need);
}

/** Stop here unless this person has at least `need` on the tank (404 when it isn't theirs at all). */
export function requireRole(userId: string, tank: Pick<Tank, 'id' | 'userId'>, need: 'log' | 'owner'): Role {
	const role = tankRole(userId, tank);
	if (!role) error(404, 'Tank not found');
	if (!roleAllows(role, need)) error(403, ROLE_REFUSED[need]);
	return role;
}

// ── The people a tank is shared with ─────────────────────────────────────────

export type MemberState = 'pending' | 'accepted' | 'expired' | 'removed';
export function memberState(m: TankMember, at = now()): MemberState {
	if (m.revokedAt) return 'removed';
	if (m.acceptedAt) return 'accepted';
	if (m.expiresAt < at) return 'expired';
	return 'pending';
}

/** Members of a tank, newest first: accepted and pending (and expired, to invite again). */
export function listMembers(tankId: string) {
	return db
		.select({ member: tankMembers, name: users.displayName, userEmail: users.email })
		.from(tankMembers)
		.leftJoin(users, eq(users.id, tankMembers.userId))
		.where(and(eq(tankMembers.tankId, tankId), isNull(tankMembers.revokedAt)))
		.orderBy(desc(tankMembers.createdAt))
		.all()
		.map((r) => ({ ...r, state: memberState(r.member) }));
}

/** Whether anyone else has access: History then says who logged each entry. */
export function isShared(tankId: string): boolean {
	return !!db
		.select({ id: tankMembers.id })
		.from(tankMembers)
		.where(and(eq(tankMembers.tankId, tankId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
		.get();
}

/** Everyone who may have logged on a tank, by id: the owner and its members. */
export function tankPeople(tank: Pick<Tank, 'id' | 'userId'>): Map<string, string> {
	const out = new Map<string, string>();
	const owner = db.select({ id: users.id, name: users.displayName, email: users.email }).from(users).where(eq(users.id, tank.userId)).get();
	if (owner) out.set(owner.id, owner.name || owner.email.split('@')[0]);
	for (const m of listMembers(tank.id)) if (m.member.userId) out.set(m.member.userId, m.name || m.member.email.split('@')[0]);
	return out;
}

/**
 * Invite someone to a tank (a pending invite for the same address is replaced).
 * If they're on the server already, the invite is accepted for them straight
 * away: the tank is in their list on their next visit. Otherwise the token goes
 * in the link, and signing in as that address accepts it.
 */
export function inviteMember(tank: Tank, email: string, role: TankRole, invitedBy: string): { member: TankMember; token: string | null } {
	const e = norm(email);
	const owner = db.select({ email: users.email }).from(users).where(eq(users.id, tank.userId)).get();
	if (owner && owner.email === e) error(400, "That's the tank's owner.");
	// one active membership each (#117): their role is changed in the list, not by inviting again
	if (hasAccess(tank.id, e)) error(400, `${e} already has access.`);
	db.update(tankMembers).set({ revokedAt: now() }).where(and(eq(tankMembers.tankId, tank.id), eq(tankMembers.email, e), isNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt))).run();
	const existing = db.select({ id: users.id }).from(users).where(eq(users.email, e)).get();
	const token = randomBytes(24).toString('base64url');
	const member = db
		.insert(tankMembers)
		.values({
			tankId: tank.id,
			email: e,
			role,
			userId: existing?.id ?? null,
			tokenHash: hash(token),
			invitedBy,
			expiresAt: new Date(Date.now() + MEMBER_INVITE_DAYS * 86_400_000).toISOString(),
			acceptedAt: existing ? now() : null
		})
		.returning()
		.get();
	return { member, token: existing ? null : token };
}

/** The invite behind a link, with the tank and who sent it. */
export function readMemberToken(token: string) {
	const row = db
		.select({ member: tankMembers, tank: tanks, inviter: users.displayName })
		.from(tankMembers)
		.innerJoin(tanks, eq(tanks.id, tankMembers.tankId))
		.leftJoin(users, eq(users.id, tankMembers.invitedBy))
		.where(eq(tankMembers.tokenHash, hash(token)))
		.get();
	return row ? { ...row, state: memberState(row.member) } : null;
}

/** Signing in as the invited address accepts every pending tank invitation for it. */
export function acceptMemberInvites(email: string, userId: string): TankMember[] {
	const e = norm(email);
	const at = now();
	const pending = db
		.select()
		.from(tankMembers)
		.where(and(eq(tankMembers.email, e), isNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
		.all()
		.filter((m) => m.expiresAt >= at);
	db.transaction((tx) => {
		for (const m of pending) {
			const current = activeMembership(m.tankId, userId);
			const tank = tx.select({ userId: tanks.userId }).from(tanks).where(eq(tanks.id, m.tankId)).get();
			if (current || tank?.userId === userId) {
				// already in (another address of theirs was invited first), or their own tank: one membership, the higher role
				if (current && RANK[m.role] > RANK[current.role]) tx.update(tankMembers).set({ role: m.role }).where(eq(tankMembers.id, current.id)).run();
				tx.update(tankMembers).set({ revokedAt: at, userId }).where(eq(tankMembers.id, m.id)).run();
			} else tx.update(tankMembers).set({ acceptedAt: at, userId }).where(eq(tankMembers.id, m.id)).run();
		}
	});
	return pending;
}

export function getMember(tankId: string, id: string): TankMember {
	const m = db.select().from(tankMembers).where(and(eq(tankMembers.id, id), eq(tankMembers.tankId, tankId))).get();
	if (!m) error(404, 'Not shared with them');
	return m;
}

export function setMemberRole(tankId: string, id: string, role: TankRole): TankMember {
	getMember(tankId, id);
	return db.update(tankMembers).set({ role }).where(eq(tankMembers.id, id)).returning().get();
}

/** Remove someone (or cancel a pending invite): the tank leaves their list on their next request. */
export function removeMember(tankId: string, id: string): TankMember {
	getMember(tankId, id);
	return db.update(tankMembers).set({ revokedAt: now() }).where(eq(tankMembers.id, id)).returning().get();
}

/**
 * Undo of Remove: the same row comes back as it was, unless they've been
 * invited again since (#117); then that newer access or invitation stands,
 * and is what's returned.
 */
export function restoreMember(tankId: string, id: string): TankMember {
	const m = getMember(tankId, id);
	if (!m.revokedAt) return m;
	return db.transaction((tx) => {
		const newer = m.acceptedAt
			? m.userId
				? activeMembership(tankId, m.userId)
				: undefined
			: tx
					.select()
					.from(tankMembers)
					.where(and(eq(tankMembers.tankId, tankId), eq(tankMembers.email, m.email), isNull(tankMembers.revokedAt)))
					.get();
		if (newer) return newer;
		return tx.update(tankMembers).set({ revokedAt: null }).where(eq(tankMembers.id, id)).returning().get();
	});
}

/** Resend a pending or expired invite: a fresh link and another 7 days. Not for someone who's in, or was removed (#117). */
export function resendMember(tank: Tank, id: string, invitedBy: string) {
	const old = getMember(tank.id, id);
	const state = memberState(old);
	if (state !== 'pending' && state !== 'expired') error(400, state === 'accepted' ? `${old.email} already has access.` : `Invite ${old.email} again instead.`);
	return inviteMember(tank, old.email, old.role, invitedBy);
}

/** Whom a tank's reminders (or alerts) go to: everyone with access who can log, or the owner only. */
export function notifiesUser(tank: Pick<Tank, 'userId' | 'remindTo' | 'alertTo'>, userId: string, kind: 'remind' | 'alert', role: Role | null): boolean {
	if (tank.userId === userId) return true;
	if (role !== 'log') return false;
	return (kind === 'remind' ? tank.remindTo : tank.alertTo) === 'all';
}
