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
