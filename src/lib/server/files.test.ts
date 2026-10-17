import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Files beside the database (#118): written before their rows and removed
// after them, without blocking the server, and never half done.
const dir = mkdtempSync(join(tmpdir(), 'wl-files-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { removeFiles, replaceFile, writeAll, writeThen } = await import('./files');
const { db } = await import('./db');
const { logs, photos } = await import('./db/schema');
const { deletePhoto, storePhotos } = await import('./photos');
const { addExpense, attachReceipt, deleteExpense, receiptOf, updateExpense } = await import('./expenses');
const { createTank } = await import('./tanks');
const { upsertUser } = await import('./users');
const { removePerson } = await import('./people');
const { eq } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

const user = upsertUser({ email: 'files@example.com', name: 'Files', googleSub: 'g-files' });
const tank = createTank(user, { name: 'Files tank', type: 'planted', nominalVolumeL: 100 });
const other = createTank(user, { name: 'Other tank', type: 'planted', nominalVolumeL: 60 });
const scratch = join(dir, 'scratch');
mkdirSync(scratch, { recursive: true });
const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2a6' } }).jpeg().toBuffer();
const photo = { full: jpeg, thumb: jpeg, width: 8, height: 8, exif: null };
const filesIn = (d: string) => (existsSync(d) ? readdirSync(d) : []);

describe('writing and removing files (#118)', () => {
	it('writes all the files or none: one that fails takes the others with it', async () => {
		// a "folder" that's a file, so the second write fails
		writeFileSync(join(scratch, 'blocker'), 'x');
		const first = join(scratch, 'a', 'one.bin');
		await expect(writeAll([[first, new Uint8Array([1])], [join(scratch, 'blocker', 'two.bin'), new Uint8Array([2])]])).rejects.toThrow();
		expect(existsSync(first)).toBe(false);
	});

	it('removes the new files when the rows can’t be saved', async () => {
		const f = join(scratch, 'b', 'one.bin');
		await expect(
			writeThen([[f, new Uint8Array([1])]], () => {
				throw new Error('the database said no');
			})
		).rejects.toThrow('the database said no');
		expect(existsSync(f)).toBe(false);
	});

	it('replaces a file whole, or leaves the old one as it was', async () => {
		const f = join(scratch, 'avatar.jpg');
		await replaceFile(f, new Uint8Array([1, 2, 3]));
		await replaceFile(f, new Uint8Array([4, 5]));
		expect([...readFileSync(f)]).toEqual([4, 5]);
		// renaming over a folder fails: nothing changes, no temporary file is left
		const d = join(scratch, 'is-a-folder');
		mkdirSync(join(d, 'inside'), { recursive: true });
		await expect(replaceFile(d, new Uint8Array([9]))).rejects.toThrow();
		expect(filesIn(scratch).filter((n) => n.endsWith('.tmp'))).toEqual([]);
		expect(filesIn(d)).toEqual(['inside']);
	});

	it('a file that can’t be removed is noted in the log, not an error', async () => {
		const d = join(scratch, 'not-empty');
		mkdirSync(join(d, 'x'), { recursive: true });
		await expect(removeFiles([d, join(scratch, 'never-was.bin')], 'photos')).resolves.toBeUndefined();
		const noted = db.select().from(logs).all().filter((l) => l.message.includes('not-empty'));
		expect(noted).toHaveLength(1);
		expect(noted[0].level).toBe('warn');
	});
});

describe('photos, receipts and people, in that order (#118)', () => {
	it('photos: files then rows, and if the rows fail, no files are left', async () => {
		const [p] = await storePhotos(tank.id, [photo], { takenAt: new Date().toISOString() });
		expect(filesIn(join(dir, 'photos', tank.id)).sort()).toEqual([`${p.id}.jpg`, `${p.id}_t.jpg`].sort());
		// a tank that doesn't exist: the rows are refused, and the files go
		await expect(storePhotos('no-such-tank', [photo, photo], { takenAt: new Date().toISOString() })).rejects.toThrow();
		expect(filesIn(join(dir, 'photos', 'no-such-tank'))).toEqual([]);
		expect(db.select().from(photos).where(eq(photos.tankId, 'no-such-tank')).all()).toEqual([]);
		// deleting: the row, then the files
		await deletePhoto(user.id, p.id);
		expect(filesIn(join(dir, 'photos', tank.id))).toEqual([]);
		expect(db.select().from(photos).where(eq(photos.id, p.id)).get()).toBeUndefined();
	});

	it('receipts: a replacement never writes over the one in use; a move copies, then removes', async () => {
		const e = addExpense(user.id, tank.id, { date: '2026-10-01', amountCents: 500, category: 'plants', what: 'Moss', note: null });
		const file = (body: Buffer, name: string) => new File([new Uint8Array(body)], name);
		expect(await attachReceipt(user.id, e.id, file(jpeg, 'one.jpg'))).toBeNull();
		const first = (await receiptOf(user.id, e.id)).expense.receiptPath!;
		expect(await attachReceipt(user.id, e.id, file(Buffer.from('%PDF-1.4 receipt'), 'two.pdf'))).toBeNull();
		const r = await receiptOf(user.id, e.id);
		expect(r.type).toBe('application/pdf');
		expect(r.expense.receiptPath).not.toBe(first);
		expect(filesIn(join(dir, 'receipts', tank.id))).toEqual([r.expense.receiptPath!.split('/').pop()]);
		// to the other tank: the receipt goes with it
		await updateExpense(user.id, e.id, { date: '2026-10-01', amountCents: 500, category: 'plants', what: 'Moss', note: null, tankId: other.id });
		const moved = await receiptOf(user.id, e.id);
		expect(moved.expense.receiptPath!.startsWith(other.id)).toBe(true);
		expect(String(moved.body)).toContain('receipt');
		expect(filesIn(join(dir, 'receipts', tank.id))).toEqual([]);
		// a receipt whose file has gone: a plain 404, not a crash
		await removeFiles([join(dir, 'receipts', moved.expense.receiptPath!)], 'server');
		await expect(receiptOf(user.id, e.id)).rejects.toMatchObject({ status: 404, body: { message: 'Receipt file missing' } });
		await deleteExpense(user.id, e.id);
	});

	it('removing a person: their rows, then each tank’s photos and receipts and their profile photos', async () => {
		const admin = upsertUser({ email: 'files-admin@example.com', name: 'Admin', googleSub: 'g-files-admin' });
		const gone = upsertUser({ email: 'files-gone@example.com', name: 'Gone', googleSub: 'g-files-gone' });
		const t = createTank(gone, { name: 'Gone tank', type: 'planted', nominalVolumeL: 40 });
		await storePhotos(t.id, [photo], { takenAt: new Date().toISOString() });
		const e = addExpense(gone.id, t.id, { date: '2026-10-01', amountCents: 100, category: 'other', what: 'x', note: null });
		await attachReceipt(gone.id, e.id, new File([new Uint8Array(jpeg)], 'r.jpg'));
		mkdirSync(join(dir, 'avatars'), { recursive: true });
		writeFileSync(join(dir, 'avatars', `${gone.id}-own.jpg`), jpeg);
		await removePerson(admin, gone.id);
		expect(existsSync(join(dir, 'photos', t.id))).toBe(false);
		expect(existsSync(join(dir, 'receipts', t.id))).toBe(false);
		expect(existsSync(join(dir, 'avatars', `${gone.id}-own.jpg`))).toBe(false);
	});
});
