import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-members-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { acceptMemberInvites, inviteMember, isShared, listMembers, notifiesUser, readMemberToken, removeMember, requireRole, roleAllows, setMemberRole, tankPeople, tankRole } = await import('./members');
const { createTank, getTank, listTanks, roleOn, updateTank } = await import('./tanks');
const { createTest } = await import('./logs');
const { upsertUser } = await import('./users');

const owner = upsertUser({ email: 'owner@example.com', name: 'Owner', googleSub: 'g-owner' });
const helper = upsertUser({ email: 'helper@example.com', name: 'Helper', googleSub: 'g-helper' });
const tank = createTank(owner, { name: 'Shared 40', type: 'planted', nominalVolumeL: 150 });

describe('sharing a tank (#22)', () => {
	it('is the owner’s alone until someone accepts', () => {
		expect(tankRole(owner.id, tank)).toBe('owner');
		expect(tankRole(helper.id, tank)).toBeNull();
		expect(listTanks(helper.id)).toHaveLength(0);
		expect(() => getTank(helper.id, tank.id)).toThrow();
		expect(isShared(tank.id)).toBe(false);
	});

	it('someone already on the server gets access straight away; a newcomer through the link', () => {
		const { member, token } = inviteMember(tank, 'Helper@Example.com', 'log', owner.id);
		expect(member.email).toBe('helper@example.com');
		expect(token).toBeNull();
		expect(member.acceptedAt).toBeTruthy();
		expect(tankRole(helper.id, tank)).toBe('log');
		expect(listTanks(helper.id).map((t) => t.id)).toEqual([tank.id]);
		expect(listTanks(helper.id, { own: true })).toHaveLength(0);
		expect(roleOn(helper.id, getTank(helper.id, tank.id))).toBe('log');
		expect(isShared(tank.id)).toBe(true);

		const { token: t2 } = inviteMember(tank, 'new@example.com', 'view', owner.id);
		expect(t2).toBeTruthy();
		expect(readMemberToken(t2!)?.state).toBe('pending');
		expect(readMemberToken('nope')).toBeNull();
		const newcomer = upsertUser({ email: 'new@example.com', name: 'New', googleSub: 'g-new' });
		expect(acceptMemberInvites('new@example.com', newcomer.id)).toHaveLength(1);
		expect(readMemberToken(t2!)?.state).toBe('accepted');
		expect(tankRole(newcomer.id, tank)).toBe('view');
		expect(listMembers(tank.id).filter((m) => m.state === 'accepted')).toHaveLength(2);
		expect(() => inviteMember(tank, 'owner@example.com', 'log', owner.id)).toThrow();
	});

	it('lets "log" log and never change setup; "view" only looks', () => {
		expect(roleAllows('log', 'log')).toBe(true);
		expect(roleAllows('log', 'owner')).toBe(false);
		expect(roleAllows('view', 'log')).toBe(false);
		expect(roleAllows(null, 'log')).toBe(false);
		expect(requireRole(helper.id, tank, 'log')).toBe('log');
		expect(() => requireRole(helper.id, tank, 'owner')).toThrow();
		expect(() => updateTank(helper.id, tank.id, { name: 'Mine now' })).toThrow();
		// logging works, and remembers who
		const { test } = createTest(helper.id, tank.id, { takenAt: new Date().toISOString(), note: null, readings: new Map() }, { timeZone: 'UTC' });
		expect(test.loggedBy).toBe(helper.id);
		expect(tankPeople(tank).get(helper.id)).toBe('Helper');
		expect(tankPeople(tank).get(owner.id)).toBe('Owner');

		const m = listMembers(tank.id).find((x) => x.member.email === 'helper@example.com')!;
		setMemberRole(tank.id, m.member.id, 'view');
		expect(tankRole(helper.id, tank)).toBe('view');
		expect(() => createTest(helper.id, tank.id, { takenAt: new Date().toISOString(), note: null, readings: new Map() }, { timeZone: 'UTC' })).toThrow();
		setMemberRole(tank.id, m.member.id, 'log');
	});

	it('routes reminders and alerts as the owner set, and removal takes the tank away', () => {
		const t = { userId: owner.id, remindTo: 'all' as const, alertTo: 'owner' as const };
		expect(notifiesUser(t, owner.id, 'remind', 'owner')).toBe(true);
		expect(notifiesUser(t, helper.id, 'remind', 'log')).toBe(true);
		expect(notifiesUser(t, helper.id, 'alert', 'log')).toBe(false);
		expect(notifiesUser(t, helper.id, 'remind', 'view')).toBe(false);
		expect(notifiesUser({ ...t, remindTo: 'owner' }, helper.id, 'remind', 'log')).toBe(false);

		const m = listMembers(tank.id).find((x) => x.member.email === 'helper@example.com')!;
		removeMember(tank.id, m.member.id);
		expect(tankRole(helper.id, tank)).toBeNull();
		expect(listTanks(helper.id)).toHaveLength(0);
	});
});

describe('one active membership per person and tank (#117)', async () => {
	const { readFileSync } = await import('node:fs');
	const { and, eq, isNotNull, isNull } = await import('drizzle-orm');
	const { db } = await import('./db');
	const { tankMembers } = await import('./db/schema');
	const { getMember, resendMember, restoreMember } = await import('./members');
	const keeper = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
	const friend = upsertUser({ email: 'friend@example.com', name: 'Friend', googleSub: 'g-friend' });
	const t2 = createTank(keeper, { name: 'Reef 90', type: 'reef', nominalVolumeL: 340 });
	const active = (userId: string) =>
		db
			.select()
			.from(tankMembers)
			.where(and(eq(tankMembers.tankId, t2.id), eq(tankMembers.userId, userId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt)))
			.all();

	it('inviting or resending someone who is in does not add a second membership', () => {
		const { member } = inviteMember(t2, 'friend@example.com', 'view', keeper.id);
		expect(() => inviteMember(t2, 'FRIEND@example.com', 'log', keeper.id)).toThrow();
		expect(() => resendMember(t2, member.id, keeper.id)).toThrow();
		expect(active(friend.id)).toHaveLength(1);
		expect(tankRole(friend.id, t2)).toBe('view');
	});

	it('a removed member can’t be resent; Undo after inviting again keeps the newer access', () => {
		const [m] = active(friend.id);
		removeMember(t2.id, m.id);
		expect(() => resendMember(t2, m.id, keeper.id)).toThrow();
		const { member: again } = inviteMember(t2, 'friend@example.com', 'log', keeper.id);
		// Undo of the old Remove: the new membership stands, no second row comes back
		expect(restoreMember(t2.id, m.id).id).toBe(again.id);
		expect(getMember(t2.id, m.id).revokedAt).toBeTruthy();
		expect(active(friend.id).map((r) => r.id)).toEqual([again.id]);
		expect(tankRole(friend.id, t2)).toBe('log');
		// Undo with nothing newer still brings the same row back
		removeMember(t2.id, again.id);
		expect(restoreMember(t2.id, again.id).revokedAt).toBeNull();
		expect(active(friend.id)).toHaveLength(1);
	});

	it('Undo of a cancelled invitation gives way to a newer one for the same address', () => {
		const { member: first } = inviteMember(t2, 'later@example.com', 'view', keeper.id);
		removeMember(t2.id, first.id);
		const { member: second } = inviteMember(t2, 'later@example.com', 'log', keeper.id);
		expect(restoreMember(t2.id, first.id).id).toBe(second.id);
		expect(listMembers(t2.id).filter((r) => r.member.email === 'later@example.com')).toHaveLength(1);
	});

	it('accepting an invitation to a tank they are already in keeps one membership, with the higher role', () => {
		// invited at an old address of theirs before it was theirs, then the account got the tank another way
		const pal = upsertUser({ email: 'pal@example.com', name: 'Pal', googleSub: 'g-pal' });
		inviteMember(t2, 'pal@example.com', 'view', keeper.id);
		const { token } = inviteMember(t2, 'pal.old@example.com', 'log', keeper.id);
		expect(token).toBeTruthy();
		acceptMemberInvites('pal.old@example.com', pal.id);
		expect(active(pal.id)).toHaveLength(1);
		expect(tankRole(pal.id, t2)).toBe('log');
	});

	it('the database refuses a second active membership', () => {
		const [m] = active(friend.id);
		expect(() => db.insert(tankMembers).values({ ...m, id: undefined, tokenHash: 'dup' }).run()).toThrow(/UNIQUE/);
	});

	it('the migration settles duplicates made before: the first stays, with the higher role', () => {
		db.$client.exec('drop index tank_members_active');
		const [m] = active(friend.id);
		const later = (s: number) => new Date(Date.parse(m.acceptedAt!) + s * 1000).toISOString();
		db.update(tankMembers).set({ role: 'view' }).where(eq(tankMembers.id, m.id)).run();
		db.insert(tankMembers).values({ ...m, id: undefined, role: 'log', tokenHash: 'dup1', acceptedAt: later(5) }).run();
		db.insert(tankMembers).values({ ...m, id: undefined, role: 'view', tokenHash: 'dup2', acceptedAt: later(9) }).run();
		expect(active(friend.id)).toHaveLength(3);
		// whatever the rows, the role is decided the same way: the higher one
		expect(tankRole(friend.id, t2)).toBe('log');
		const sql = readFileSync(new URL('../../../drizzle/0043_one_active_membership.sql', import.meta.url), 'utf8');
		for (const stmt of sql.split('--> statement-breakpoint')) db.$client.exec(stmt);
		expect(active(friend.id).map((r) => ({ id: r.id, role: r.role }))).toEqual([{ id: m.id, role: 'log' }]);
		expect(tankRole(friend.id, t2)).toBe('log');
	});
});
