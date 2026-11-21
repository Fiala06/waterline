import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Deleting your own account (#303): your tanks and their files go, tanks
// others share with you stay theirs with what you logged, never the last admin.
const dir = mkdtempSync(join(tmpdir(), 'wl-account-delete-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, tankMembers, tanks, users } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser, getUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createEvent } = await import('./logs');
const { storePhotos } = await import('./photos');
const { acceptMemberInvites, inviteMember } = await import('./members');
const { accountFootprint, deleteOwnAccount } = await import('./people');
const sharp = (await import('sharp')).default;

const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2a6' } }).jpeg().toBuffer();
const share = (tank: Parameters<typeof inviteMember>[0], who: { id: string; email: string }, by: string) =>
	acceptMemberInvites(who.email, who.id, { id: inviteMember(tank, who.email, 'log', by).member.id });

describe('deleting your own account (#303)', () => {
	it('takes your tanks and their files, leaves the tanks shared with you and what you logged on them', async () => {
		const me = upsertUser({ email: 'leaving@example.com', name: 'Leaving', googleSub: 'g-leaving' });
		const friend = upsertUser({ email: 'friend@example.com', name: 'Friend', googleSub: 'g-friend' });
		const mine = createTank(me, { name: 'Mine', type: 'planted', nominalVolumeL: 40 });
		const theirs = createTank(friend, { name: 'Theirs', type: 'freshwater', nominalVolumeL: 60 });
		share(mine, friend, me.id);
		share(theirs, me, friend.id);
		await storePhotos(mine.id, [{ full: jpeg, thumb: jpeg, width: 8, height: 8, exif: null }], { takenAt: new Date().toISOString() });
		const logged = createEvent(me.id, theirs.id, { category: 'note', occurredAt: new Date().toISOString(), note: 'Fed them', data: {} }, { timeZone: 'UTC' }).event;

		expect(accountFootprint(me.id)).toEqual({ tanks: 1, photos: 1, sharedWith: 1, member: 1 });
		await deleteOwnAccount(getUser(me.id)!);

		expect(getUser(me.id)).toBeUndefined();
		expect(db.select().from(tanks).where(eq(tanks.id, mine.id)).get()).toBeUndefined();
		expect(existsSync(join(dir, 'photos', mine.id))).toBe(false);
		// the friend's tank, and the note logged on it, stay
		expect(db.select().from(tanks).where(eq(tanks.id, theirs.id)).get()?.name).toBe('Theirs');
		expect(db.select().from(events).where(eq(events.id, logged.id)).get()?.note).toBe('Fed them');
		expect(db.select().from(tankMembers).where(eq(tankMembers.userId, me.id)).all()).toEqual([]);
		expect(getUser(friend.id)?.email).toBe('friend@example.com');
	});

	it("never deletes the server's last admin", async () => {
		const admin = upsertUser({ email: 'only-admin@example.com', name: 'Admin', googleSub: 'g-only-admin' });
		db.update(users).set({ isAdmin: false }).run();
		db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id)).run();
		await expect(deleteOwnAccount(getUser(admin.id)!)).rejects.toMatchObject({ status: 400 });
		expect(getUser(admin.id)).toBeDefined();
	});
});
