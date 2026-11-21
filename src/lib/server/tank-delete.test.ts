import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Deleting a tank for good (#304): archived first, its owner only, and it goes
// with its files and the backups that hold it; other tanks stay as they were.
const dir = mkdtempSync(join(tmpdir(), 'wl-tank-delete-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, exports, photos, publicPages, tanks, tasks } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser, getUser } = await import('./users');
const { createTank, setArchived } = await import('./tanks');
const { createEvent } = await import('./logs');
const { storePhotos } = await import('./photos');
const { acceptMemberInvites, inviteMember } = await import('./members');
const { deleteTank, tankFootprint } = await import('./tank-delete');
const sharp = (await import('sharp')).default;

const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2a6' } }).jpeg().toBuffer();
const now = () => new Date().toISOString();

async function setup(tag: string) {
	const owner = getUser(upsertUser({ email: `owner-${tag}@example.com`, name: 'Owner', googleSub: `g-owner-${tag}` }).id)!;
	const friend = getUser(upsertUser({ email: `friend-${tag}@example.com`, name: 'Friend', googleSub: `g-friend-${tag}` }).id)!;
	const doomed = createTank(owner, { name: 'Test cube', type: 'freshwater', nominalVolumeL: 20 });
	const kept = createTank(owner, { name: 'Keeper', type: 'planted', nominalVolumeL: 60 });
	acceptMemberInvites(friend.email, friend.id, { id: inviteMember(doomed, friend.email, 'log', owner.id).member.id });
	createEvent(owner.id, doomed.id, { category: 'note', occurredAt: now(), note: 'gone soon', data: {} }, { timeZone: 'UTC' });
	const keptNote = createEvent(owner.id, kept.id, { category: 'note', occurredAt: now(), note: 'stays', data: {} }, { timeZone: 'UTC' }).event;
	await storePhotos(doomed.id, [{ full: jpeg, thumb: jpeg, width: 8, height: 8, exif: null }], { takenAt: now() });
	await storePhotos(kept.id, [{ full: jpeg, thumb: jpeg, width: 8, height: 8, exif: null }], { takenAt: now() });
	db.insert(publicPages).values({ tankId: doomed.id, enabled: true, slug: `cube-${tag}` }).run();
	return { owner, friend, doomed, kept, keptNote };
}

/** A built backup, with its file on disk. */
function built(userId: string, scope: 'tank' | 'account', tankId: string | null, status: 'ready' | 'building' = 'ready') {
	const row = db.insert(exports).values({ userId, scope, tankId, format: 'zip', status }).returning().get();
	mkdirSync(join(dir, 'exports'), { recursive: true });
	const file = join(dir, 'exports', `${row.id}.zip`);
	writeFileSync(file, 'zip');
	db.update(exports).set({ filePath: file }).where(eq(exports.id, row.id)).run();
	return { id: row.id, file };
}

describe('deleting a tank for good (#304)', () => {
	it('needs the tank archived, and its owner', async () => {
		const { owner, friend, doomed } = await setup('rules');
		expect(() => tankFootprint(owner.id, doomed.id)).toThrow();
		await expect(deleteTank(owner, doomed.id)).rejects.toMatchObject({ status: 400 });
		setArchived(owner.id, doomed.id, true);
		// someone it's shared with can't, even archived
		await expect(deleteTank(friend, doomed.id)).rejects.toMatchObject({ status: 403 });
		// archived and restored: still all there
		setArchived(owner.id, doomed.id, false);
		expect(db.select().from(tanks).where(eq(tanks.id, doomed.id)).get()?.archivedAt).toBeNull();
	});

	it('takes everything in it, its files and the backups holding it, and leaves the other tanks alone', async () => {
		const { owner, doomed, kept, keptNote } = await setup('go');
		setArchived(owner.id, doomed.id, true);
		expect(tankFootprint(owner.id, doomed.id)).toMatchObject({ tank: { name: 'Test cube' }, photos: 1, sharedWith: 1, public: true });
		const own = built(owner.id, 'tank', doomed.id);
		const whole = built(owner.id, 'account', null);
		const other = built(owner.id, 'tank', kept.id);

		expect(await deleteTank(owner, doomed.id)).toBe('Test cube');
		expect(db.select().from(tanks).where(eq(tanks.id, doomed.id)).get()).toBeUndefined();
		for (const t of [events, photos, tasks, publicPages]) expect(db.select().from(t).where(eq(t.tankId, doomed.id)).all()).toEqual([]);
		expect(existsSync(join(dir, 'photos', doomed.id))).toBe(false);
		expect(existsSync(own.file)).toBe(false);
		expect(existsSync(whole.file)).toBe(false);
		expect(db.select().from(exports).where(eq(exports.id, whole.id)).get()?.status).toBe('expired');
		// the other tank, its photo and its backup stay
		expect(db.select().from(events).where(eq(events.id, keptNote.id)).get()?.note).toBe('stays');
		expect(existsSync(join(dir, 'photos', kept.id))).toBe(true);
		expect(existsSync(other.file)).toBe(true);
	});

	it('waits for a backup being built, and changes nothing meanwhile', async () => {
		const { owner, doomed } = await setup('busy');
		setArchived(owner.id, doomed.id, true);
		built(owner.id, 'account', null, 'building');
		await expect(deleteTank(owner, doomed.id)).rejects.toMatchObject({ status: 409 });
		expect(db.select().from(tanks).where(eq(tanks.id, doomed.id)).get()).toBeDefined();
		expect(existsSync(join(dir, 'photos', doomed.id))).toBe(true);
	});
});
