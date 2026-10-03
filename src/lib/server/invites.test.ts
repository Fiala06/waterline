import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-invites-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { invites, serverSettings, users } = await import('./db/schema');
const { getServerSettings } = await import('./mail');
const { acceptInvite, createInvite, inviteAllows, inviteState, listInvites, readInvite, resendInvite, revokeInvite } = await import('./invites');
const { isEmailAllowed, upsertUser } = await import('./users');
const { adminCount, removePerson, setAdmin, signOutEverywhere } = await import('./people');

const setMode = (signupMode: 'admin' | 'list' | 'invited' | 'open', allowedEmails: string | null = null) => {
	getServerSettings();
	db.update(serverSettings).set({ signupMode, allowedEmails, adminEmail: 'owner@example.com' }).where(eq(serverSettings.id, 1)).run();
};

describe('invitations (#27)', () => {
	it('lets an invited address in while the invitation is pending or accepted, and not after it is revoked', () => {
		setMode('invited');
		expect(isEmailAllowed('friend@example.com')).toBe(false);
		const { invite, token } = createInvite('Friend@Example.com', null);
		expect(invite.email).toBe('friend@example.com');
		expect(readInvite(token)?.state).toBe('pending');
		expect(readInvite('nope')).toBeNull();
		expect(inviteAllows('friend@example.com')).toBe(true);
		expect(isEmailAllowed('friend@example.com')).toBe(true);
		expect(isEmailAllowed('stranger@example.com')).toBe(false);

		// signing in accepts it
		const u = upsertUser({ email: 'friend@example.com', name: 'Friend', googleSub: 'g-f' });
		expect(acceptInvite('friend@example.com', u.id)?.acceptedUserId).toBe(u.id);
		expect(readInvite(token)?.state).toBe('accepted');
		expect(acceptInvite('friend@example.com', u.id)).toBeNull();
		expect(isEmailAllowed('friend@example.com')).toBe(true);

		// revoked: out on the next request
		revokeInvite(invite.id);
		expect(isEmailAllowed('friend@example.com')).toBe(false);
		expect(readInvite(token)?.state).toBe('revoked');
	});

	it('expires after 7 days, and a resend starts a fresh link', () => {
		setMode('invited');
		const { invite, token } = createInvite('late@example.com', null);
		db.update(invites).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(invites.id, invite.id)).run();
		expect(inviteState(db.select().from(invites).where(eq(invites.id, invite.id)).get()!)).toBe('expired');
		expect(inviteAllows('late@example.com')).toBe(false);
		expect(acceptInvite('late@example.com', 'x')).toBeNull();
		const again = resendInvite(invite.id, null)!;
		expect(again.token).not.toBe(token);
		expect(readInvite(again.token)?.state).toBe('pending');
		expect(inviteAllows('late@example.com')).toBe(true);
		// a new invitation for the same address replaces the pending one
		createInvite('late@example.com', null);
		expect(listInvites().filter((i) => i.invite.email === 'late@example.com' && i.state === 'pending')).toHaveLength(1);
	});

	it('counts beside a list, and never when only the admin may sign in', () => {
		createInvite('listed@example.com', null);
		setMode('list', 'other@example.com');
		expect(isEmailAllowed('listed@example.com')).toBe(true);
		expect(isEmailAllowed('other@example.com')).toBe(true);
		setMode('admin');
		expect(isEmailAllowed('listed@example.com')).toBe(false);
		expect(isEmailAllowed('owner@example.com')).toBe(true);
	});
});

describe('people (#27)', () => {
	it('keeps at least one admin, signs out everywhere and removes a person with their invitation', () => {
		setMode('invited');
		const owner = upsertUser({ email: 'owner@example.com', name: 'Owner', googleSub: 'g-o' });
		expect(owner.isAdmin).toBe(true);
		const { invite } = createInvite('helper@example.com', owner.id);
		const helper = upsertUser({ email: 'helper@example.com', name: 'Helper', googleSub: 'g-h' });
		acceptInvite(helper.email, helper.id);
		expect(adminCount()).toBeGreaterThanOrEqual(1);

		expect(() => setAdmin(owner, owner.id, false)).toThrow();
		expect(setAdmin(owner, helper.id, true).isAdmin).toBe(true);
		expect(setAdmin(owner, helper.id, false).isAdmin).toBe(false);

		const before = Date.now();
		expect(Date.parse(signOutEverywhere(owner, helper.id).sessionsRevokedAt!)).toBeGreaterThanOrEqual(before - 1000);

		expect(() => removePerson(owner, owner.id)).toThrow();
		removePerson(owner, helper.id);
		expect(db.select().from(users).where(eq(users.id, helper.id)).get()).toBeUndefined();
		expect(db.select().from(invites).where(eq(invites.id, invite.id)).get()?.revokedAt).toBeTruthy();
		expect(isEmailAllowed('helper@example.com')).toBe(false);
	});
});
