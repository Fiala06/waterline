// Photos on disk in DATA_DIR/photos/<tankId>/: a 2048px full-size image and a
// 400px square thumbnail, both JPEG. EXIF (including GPS) is stripped.
import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { parseExifHint, readExifDate, takenAtFrom, type ExifDate } from '$lib/exif';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { events, photos, publicPages, tanks, tests } from './db/schema';
import { getTank } from './tanks';

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTOS_PER_ENTRY = 10;
const FULL = 2048;
const THUMB = 400;

const root = () => join(env.DATA_DIR ?? './data', 'photos');

export type Photo = typeof photos.$inferSelect;

/** Image files from a multipart form field, ignoring empty inputs. */
export function photoFiles(form: FormData, field = 'photos'): File[] {
	return form
		.getAll(field)
		.filter((f): f is File => f instanceof File && f.size > 0)
		.slice(0, MAX_PHOTOS_PER_ENTRY);
}

/**
 * The dates taken the browser read before shrinking the photos (#42), one per
 * file in order: shrinking drops the details, so this is all that's left of them.
 */
export function photoHints(form: FormData, field = 'photoTaken'): (string | null)[] {
	return form.getAll(field).map((v) => (typeof v === 'string' && v ? v : null));
}

export function checkPhotoFiles(files: File[]): string | null {
	for (const f of files) {
		if (f.size > MAX_PHOTO_BYTES) return `${f.name || 'A photo'} is over 20 MB.`;
		if (f.type && !f.type.startsWith('image/')) return `${f.name || 'That file'} isn't an image.`;
	}
	return null;
}

const MAX_PIXELS = 100_000_000;

export interface PreparedPhoto {
	full: Buffer;
	thumb: Buffer;
	width: number;
	height: number;
	/** the date taken from the photo's details (#42), read before they're stripped; null when it has none */
	exif: ExifDate | null;
	/** the instant it was taken, once datePhotos() has worked it out; otherwise it takes the entry's date */
	takenAt?: string;
}

/**
 * Decode and resize uploads before anything is saved, so a bad file fails the
 * whole form instead of leaving an entry without its photo. `hints` are the
 * dates the browser read before shrinking the photos, one per file.
 */
export async function preparePhotos(files: File[], hints: (string | null)[] = []): Promise<PreparedPhoto[] | { error: string }> {
	const tooBig = checkPhotoFiles(files);
	if (tooBig) return { error: tooBig };
	const out: PreparedPhoto[] = [];
	for (const [i, file] of files.entries()) {
		try {
			const input = Buffer.from(await file.arrayBuffer());
			const image = sharp(input, { failOn: 'error', limitInputPixels: MAX_PIXELS });
			// the date taken, from the details the output won't carry; the browser's reading when it shrank the photo first
			const exif = readExifDate((await image.metadata()).exif ?? new Uint8Array(0)) ?? parseExifHint(hints[i]);
			// rotate() applies EXIF orientation; output carries no metadata (no GPS).
			// the pixel cap keeps a tiny file that decodes to a huge image from tying up the server
			const { data: full, info } = await image
				.rotate()
				.resize(FULL, FULL, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82, mozjpeg: true })
				.toBuffer({ resolveWithObject: true });
			const thumb = await sharp(full).resize(THUMB, THUMB, { fit: 'cover' }).jpeg({ quality: 76 }).toBuffer();
			out.push({ full, thumb, width: info.width, height: info.height, exif });
		} catch (e) {
			const huge = String((e as Error)?.message).includes('pixel limit');
			return { error: `${file.name || 'A photo'} ${huge ? 'is too large (over 100 megapixels)' : "couldn't be read as an image"}.` };
		}
	}
	return out;
}

/**
 * Give each photo the date it was taken (#42): from its details when it has a
 * usable one, else `fallback` (now, or the date the keeper picked). Photos on
 * a log entry skip this and take the entry's date.
 */
export function datePhotos<T extends PreparedPhoto>(prepared: T[], timeZone: string, fallback = new Date().toISOString(), now = new Date()): T[] {
	for (const p of prepared) p.takenAt = takenAtFrom(p.exif, timeZone, now) ?? fallback;
	return prepared;
}

/** The date a photo on an entry was taken, to offer for the entry when it's another day. */
export function photoDate(p: PreparedPhoto, timeZone: string): string | null {
	return takenAtFrom(p.exif, timeZone);
}

export function storePhotos(
	tankId: string,
	prepared: PreparedPhoto[],
	link: { eventId?: string | null; testId?: string | null; takenAt: string }
): Photo[] {
	if (!prepared.length) return [];
	const dir = join(root(), tankId);
	mkdirSync(dir, { recursive: true });
	return prepared.map((p) => {
		const id = crypto.randomUUID();
		writeFileSync(join(dir, `${id}.jpg`), p.full);
		writeFileSync(join(dir, `${id}_t.jpg`), p.thumb);
		return db
			.insert(photos)
			.values({
				id,
				tankId,
				eventId: link.eventId ?? null,
				testId: link.testId ?? null,
				path: join(tankId, `${id}.jpg`),
				thumbPath: join(tankId, `${id}_t.jpg`),
				width: p.width,
				height: p.height,
				takenAt: p.takenAt ?? link.takenAt
			})
			.returning()
			.get();
	});
}

/** The keeper fixes a photo's date in the viewer (#42): from then on it no longer follows its entry's. */
export function setPhotoDate(userId: string, photoId: string, takenAt: string) {
	const p = getPhoto(userId, photoId);
	requireRoleOn(userId, p.tankId, 'log');
	db.update(photos).set({ takenAt, takenAtSet: true }).where(eq(photos.id, p.id)).run();
	return p;
}

/** An entry moved to another date: its photos move with it, except those whose date the keeper set. */
export function followEntryDate(entry: { eventId?: string; testId?: string }, takenAt: string) {
	db.update(photos)
		.set({ takenAt })
		.where(and(entry.eventId ? eq(photos.eventId, entry.eventId) : eq(photos.testId, entry.testId!), eq(photos.takenAtSet, false)))
		.run();
}

/** A photo the user owns, or a 404. */
export function getPhoto(userId: string, photoId: string): Photo {
	const row = db
		.select({ photo: photos })
		.from(photos)
		.innerJoin(tanks, eq(tanks.id, photos.tankId))
		.where(and(eq(photos.id, photoId), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Photo not found');
	return row.photo;
}

export function photoFilePath(p: Photo, size: 'full' | 'thumb') {
	return join(root(), size === 'thumb' ? p.thumbPath : p.path);
}

/** A photo is going away: stop using it as a tank cover or public share image. */
function unlinkPhoto(id: string) {
	db.update(tanks).set({ coverPhotoId: null }).where(eq(tanks.coverPhotoId, id)).run();
	db.update(publicPages).set({ ogPhotoId: null }).where(eq(publicPages.ogPhotoId, id)).run();
}

export function deletePhoto(userId: string, photoId: string) {
	const p = getPhoto(userId, photoId);
	requireRoleOn(userId, p.tankId, 'log');
	unlinkPhoto(p.id);
	db.delete(photos).where(eq(photos.id, photoId)).run();
	rmSync(photoFilePath(p, 'full'), { force: true });
	rmSync(photoFilePath(p, 'thumb'), { force: true });
	return p;
}

/** Delete photos by id, but only ones attached to the given entry. */
export function deleteEntryPhotos(userId: string, ids: string[], entry: { eventId?: string; testId?: string }) {
	for (const id of ids) {
		const p = getPhoto(userId, id);
		if ((entry.eventId && p.eventId === entry.eventId) || (entry.testId && p.testId === entry.testId)) {
			deletePhoto(userId, id);
		}
	}
}

/** Remove files for photos whose entry is being deleted (rows go with the entry). */
export function removeEntryPhotoFiles(entry: { eventId?: string; testId?: string }) {
	const rows = db
		.select()
		.from(photos)
		.where(entry.eventId ? eq(photos.eventId, entry.eventId) : eq(photos.testId, entry.testId!))
		.all();
	for (const p of rows) {
		unlinkPhoto(p.id);
		db.delete(photos).where(eq(photos.id, p.id)).run();
		rmSync(photoFilePath(p, 'full'), { force: true });
		rmSync(photoFilePath(p, 'thumb'), { force: true });
	}
}

export function entryPhotos(entry: { eventId?: string; testId?: string }) {
	return db
		.select()
		.from(photos)
		.where(entry.eventId ? eq(photos.eventId, entry.eventId) : eq(photos.testId, entry.testId!))
		.orderBy(asc(photos.takenAt))
		.all();
}

/** First photo per entry, for feed thumbnails. */
export function thumbsFor(eventIds: string[], testIds: string[]) {
	const out = new Map<string, string>();
	if (eventIds.length) {
		for (const p of db.select().from(photos).where(inArray(photos.eventId, eventIds)).orderBy(asc(photos.takenAt)).all()) {
			if (p.eventId && !out.has(p.eventId)) out.set(p.eventId, p.id);
		}
	}
	if (testIds.length) {
		for (const p of db.select().from(photos).where(inArray(photos.testId, testIds)).orderBy(asc(photos.takenAt)).all()) {
			if (p.testId && !out.has(p.testId)) out.set(p.testId, p.id);
		}
	}
	return out;
}

/** All photos for a tank, newest first, with the entry they belong to. */
export function tankPhotos(userId: string, tankId: string) {
	getTank(userId, tankId);
	return db
		.select({ photo: photos, event: events, test: tests })
		.from(photos)
		.leftJoin(events, eq(events.id, photos.eventId))
		.leftJoin(tests, eq(tests.id, photos.testId))
		.where(eq(photos.tankId, tankId))
		.orderBy(desc(photos.takenAt), desc(photos.id))
		.all();
}

export function setCover(userId: string, photoId: string) {
	const p = getPhoto(userId, photoId);
	requireRoleOn(userId, p.tankId, 'owner');
	// a new cover starts in the middle; Settings moves it
	db.update(tanks).set({ coverPhotoId: p.id, coverX: 50, coverY: 50 }).where(eq(tanks.id, p.tankId)).run();
	return p;
}
