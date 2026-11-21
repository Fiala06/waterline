import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import yazl from 'yazl';

// Restoring a backup (#306): a real backup of a tank with something of
// everything, restored into another account as a new private tank, with every
// link between its rows kept; the same again flagged; a damaged one adds nothing.
const dir = mkdtempSync(join(tmpdir(), 'wl-restore-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const s = await import('./db/schema');
const { upsertUser, getUser } = await import('./users');
const { createTank, listParams } = await import('./tanks');
const { createEvent, createTest } = await import('./logs');
const { addEquipment, addLivestock } = await import('./specs');
const { storePhotos, photoFilePath } = await import('./photos');
const { addExpense, attachReceipt } = await import('./expenses');
const { addWish, parseWish } = await import('./wishes');
const { completeTask, listTasks } = await import('./tasks');
const { startExport } = await import('./export');
const { previewRestore, restoreBackup, RestoreError } = await import('./restore');
const sharp = (await import('sharp')).default;

const jpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#2a6' } }).jpeg().toBuffer();
const tz = 'UTC';
const owner = upsertUser({ email: 'backup-owner@example.com', name: 'Owner', googleSub: 'g-backup-owner' });
const other = upsertUser({ email: 'restorer@example.com', name: 'Restorer', googleSub: 'g-restorer' });
const tank = createTank(owner, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 150 });

// something of everything, linked
const params = listParams(tank.id);
const nitrate = params.find((p) => p.key === 'no3')!;
createTest(owner.id, tank.id, { takenAt: '2026-10-01T09:00:00.000Z', note: 'first', readings: new Map([[nitrate.id, 15]]) }, { timeZone: tz });
const heater = addEquipment(owner.id, tank.id, { type: 'heater', brand: 'Eheim', model: 'Jäger 50', specs: {}, installedAt: '2026-09-01', notes: null }, tz);
const fish = addLivestock(owner.id, tank.id, { kind: 'fish', commonName: 'Honey gourami', scientificName: null, count: 2, status: 'in_tank', addedAt: '2026-09-15', source: null }).row;
const note = createEvent(owner.id, tank.id, { category: 'note', occurredAt: '2026-10-02T09:00:00.000Z', note: 'New heater', data: { equipment_id: heater.id } }, { timeZone: tz }).event;
const [photo] = await storePhotos(tank.id, [{ full: jpeg, thumb: jpeg, width: 16, height: 12, exif: null }], { eventId: note.id, takenAt: note.occurredAt });
db.insert(s.photoLivestock).values({ photoId: photo.id, livestockId: fish.id }).run();
const spent = addExpense(owner.id, tank.id, { date: '2026-10-01', amountCents: 2999, category: 'equipment', what: 'Heater', note: null, equipmentId: heater.id, currency: 'EUR' });
await attachReceipt(owner.id, spent.id, new File([new Uint8Array(jpeg)], 'r.jpg'));
const wishForm = new FormData();
for (const [k, v] of Object.entries({ kind: 'plant', name: 'Java fern', price: '6' })) wishForm.set(k, v);
addWish(owner.id, tank.id, parseWish(wishForm).input, 'EUR');
const wc = listTasks(owner.id, tank.id).map((r) => r.task).find((t) => t.kind === 'water_change')!;
completeTask(owner.id, wc.id, { at: '2026-10-03T09:00:00.000Z', timeZone: tz });
// overdue in the backup
db.update(s.tasks).set({ nextDue: '2026-01-01', snoozedUntil: null }).where(eq(s.tasks.id, wc.id)).run();

async function backupZip(): Promise<Buffer> {
	const row = startExport(owner, 'account', null, 'zip');
	for (let i = 0; i < 400; i++) {
		const r = db.select().from(s.exports).where(eq(s.exports.id, row.id)).get()!;
		if (r.status === 'ready') return readFileSync(join(dir, 'exports', `${row.id}.zip`));
		if (r.status === 'failed') throw new Error('export failed');
		await new Promise((res) => setTimeout(res, 25));
	}
	throw new Error('export never finished');
}

const zip = await backupZip();

describe('restoring a backup (#306)', () => {
	it('previews what is in it, and restores it as a new private tank with every link kept', async () => {
		const me = getUser(other.id)!;
		const preview = previewRestore(me, zip);
		expect(preview.version).toBe(2);
		expect(preview.tanks).toHaveLength(1);
		expect(preview.tanks[0]).toMatchObject({ name: 'Riverbed 40', already: false, missingFiles: 0, counts: { tests: 1, photos: 1, livestock: 1, equipment: 1, expenses: 1 } });

		const [made] = await restoreBackup(me, preview.token, [tank.id]);
		expect(made.id).not.toBe(tank.id);
		const t = db.select().from(s.tanks).where(eq(s.tanks.id, made.id)).get()!;
		expect(t).toMatchObject({ userId: other.id, name: 'Riverbed 40', type: 'planted' });

		// the test, with its reading against the new tank's own parameter
		const [test] = db.select().from(s.tests).where(eq(s.tests.tankId, made.id)).all();
		const [reading] = db.select().from(s.testReadings).where(eq(s.testReadings.testId, test.id)).all();
		const param = db.select().from(s.tankParameters).where(eq(s.tankParameters.id, reading.parameterId)).get()!;
		expect(param).toMatchObject({ tankId: made.id, key: 'no3' });
		expect(reading.value).toBe(15);

		// the note's link to the heater, inside its data, points at the new heater
		const [newHeater] = db.select().from(s.equipment).where(eq(s.equipment.tankId, made.id)).all();
		const newNote = db.select().from(s.events).where(and(eq(s.events.tankId, made.id), eq(s.events.note, 'New heater'))).get()!;
		expect(newNote.data).toMatchObject({ equipment_id: newHeater.id });
		expect(newNote.loggedBy).toBe(other.id);

		// the photo: on the note, with the fish tagged, its files written
		const [p] = db.select().from(s.photos).where(eq(s.photos.tankId, made.id)).all();
		expect(p.eventId).toBe(newNote.id);
		const [tag] = db.select().from(s.photoLivestock).where(eq(s.photoLivestock.photoId, p.id)).all();
		const newFish = db.select().from(s.livestock).where(eq(s.livestock.id, tag.livestockId)).get()!;
		expect(newFish).toMatchObject({ tankId: made.id, commonName: 'Honey gourami' });
		expect(existsSync(photoFilePath(p, 'full'))).toBe(true);
		expect(existsSync(photoFilePath(p, 'thumb'))).toBe(true);

		// spending: its currency, its item, its receipt
		const [e] = db.select().from(s.expenses).where(eq(s.expenses.tankId, made.id)).all();
		expect(e).toMatchObject({ amountCents: 2999, currency: 'EUR', equipmentId: newHeater.id, receiptType: 'image/jpeg' });
		expect(existsSync(join(dir, 'receipts', e.receiptPath!))).toBe(true);

		// the wish list, and the task with when it was done
		expect(db.select().from(s.wishes).where(eq(s.wishes.tankId, made.id)).all().map((w) => w.name)).toEqual(['Java fern']);
		const newTasks = db.select().from(s.tasks).where(eq(s.tasks.tankId, made.id)).all();
		const newWc = newTasks.find((x) => x.kind === 'water_change')!;
		expect(db.select().from(s.taskCompletions).where(eq(s.taskCompletions.taskId, newWc.id)).all()).toHaveLength(1);
		// overdue in the backup: no alert for it now
		const keys = db.select().from(s.emailLog).where(eq(s.emailLog.userId, other.id)).all().map((r) => r.key);
		expect(keys).toContain(`overdue:${newWc.id}:2026-01-01`);

		// the original is untouched
		expect(db.select().from(s.tanks).where(eq(s.tanks.id, tank.id)).get()?.userId).toBe(owner.id);
	});

	it('flags a tank already restored', () => {
		const again = previewRestore(getUser(other.id)!, zip);
		expect(again.tanks[0].already).toBe(true);
	});

	it('restores a format 1 backup, and refuses one from a newer Waterline or a damaged one, adding nothing', async () => {
		const me = getUser(other.id)!;
		const make = async (json: unknown, extra: Record<string, Buffer> = {}) => {
			const z = new yazl.ZipFile();
			z.addBuffer(Buffer.from(JSON.stringify(json)), 'waterline.json');
			for (const [name, b] of Object.entries(extra)) z.addBuffer(b, name);
			z.end();
			const parts: Buffer[] = [];
			for await (const c of z.outputStream) parts.push(c as Buffer);
			return Buffer.concat(parts);
		};
		const v1 = await make({ format: 'waterline-backup', version: 1, tanks: [{ id: 'old-tank', name: 'Old bowl', type: 'freshwater', createdAt: '2025-01-01T00:00:00.000Z', events: [{ id: 'old-ev', category: 'note', occurredAt: '2025-02-01T00:00:00.000Z', note: 'hello', data: {} }] }] });
		const p1 = previewRestore(me, v1);
		const [bowl] = await restoreBackup(me, p1.token, ['old-tank']);
		expect(db.select().from(s.events).where(eq(s.events.tankId, bowl.id)).all().map((e) => e.note)).toEqual(['hello']);

		expect(() => previewRestore(me, Buffer.from('not a zip'))).toThrow(RestoreError);
		await expect(make({ format: 'waterline-backup', version: 99, tanks: [] }).then((b) => previewRestore(me, b))).rejects.toThrow(/newer Waterline/);

		// a photo that isn't one: nothing at all goes in, and no file is left behind
		const tanksBefore = db.select().from(s.tanks).where(eq(s.tanks.userId, other.id)).all().length;
		const bad = await make(
			{ format: 'waterline-backup', version: 2, tanks: [{ id: 'bad-tank', name: 'Broken', type: 'reef', photos: [{ id: 'bad-photo', file: 'photos/x.jpg', takenAt: '2025-01-01T00:00:00.000Z' }] }] },
			{ 'photos/x.jpg': Buffer.from('not a jpeg') }
		);
		const pb = previewRestore(me, bad);
		await expect(restoreBackup(me, pb.token, ['bad-tank'])).rejects.toThrow(/isn't a photo/);
		expect(db.select().from(s.tanks).where(eq(s.tanks.userId, other.id)).all().length).toBe(tanksBefore);
		// a row the database refuses once the photo files are written (a test with no time): rolled back, files gone
		const broken = await make({
			format: 'waterline-backup',
			version: 2,
			tanks: [{ id: 'b2', name: 'Broken 2', type: 'reef', photos: [{ id: 'ok-photo', file: 'photos/ok.jpg', takenAt: '2025-01-01T00:00:00.000Z' }], tests: [{ id: 't1' }] }]
		}, { 'photos/ok.jpg': jpeg });
		const pk = previewRestore(me, broken);
		await expect(restoreBackup(me, pk.token, ['b2'])).rejects.toThrow(/Nothing was added/);
		expect(db.select().from(s.tanks).where(eq(s.tanks.userId, other.id)).all().length).toBe(tanksBefore);
		const left = db.select().from(s.photos).where(inArray(s.photos.tankId, db.select({ id: s.tanks.id }).from(s.tanks).where(eq(s.tanks.userId, other.id)).all().map((t) => t.id))).all().length;
		const onDisk = readdirSync(join(dir, 'photos')).flatMap((d) => readdirSync(join(dir, 'photos', d))).length;
		expect(onDisk).toBe(left * 2 + 2); // each restored photo's full and thumb, plus the original's two
	});
});
