// Profile photos in DATA_DIR/avatars, served only to their owner from /avatar,
// so browsers never load them from Google (they stay private, and work
// offline). The Google photo is copied again at each Google sign-in; a photo
// someone uploads is kept beside it and shown instead, whatever Google has.
// Without either, the account menu shows initials.
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { avatarImage, largerGooglePhoto } from './avatar-image';
import { db } from './db';
import { users } from './db/schema';
import { removeFiles, replaceFile } from './files';
import { dataDir } from './instance';
import { logger } from './log';

const MAX_BYTES = 5_000_000;
/** the largest photo someone can upload (phones' own photos are well under) */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const avatarFile = (userId: string) => join(dataDir(), 'avatars', `${userId}.jpg`);
export const ownAvatarFile = (userId: string) => join(dataDir(), 'avatars', `${userId}-own.jpg`);

/** Copy the photo in the background; sign-in doesn't wait for it, and a failure only means initials. */
export async function copyGoogleAvatar(userId: string, url: string) {
	try {
		if (!url.startsWith('https://')) return;
		const res = await fetch(largerGooglePhoto(url), { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('The photo is too large');
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > MAX_BYTES) throw new Error('The photo is too large');
		await replaceFile(avatarFile(userId), await avatarImage(buf));
		db.update(users).set({ avatarAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
	} catch (e) {
		logger.warn('sign-in', "Couldn't copy the Google profile photo", { userId, error: e });
	}
}

/** A photo they chose, shown from now on. Resizing drops its metadata, location included. */
export async function saveOwnAvatar(userId: string, file: File): Promise<{ error: string } | null> {
	if (!file.size) return { error: 'Choose a photo.' };
	if (file.size > MAX_UPLOAD_BYTES) return { error: 'That photo is over 20 MB.' };
	let img: Buffer;
	try {
		img = await avatarImage(Buffer.from(await file.arrayBuffer()));
	} catch {
		return { error: "That file couldn't be read as a photo." };
	}
	try {
		await replaceFile(ownAvatarFile(userId), img);
	} catch (e) {
		logger.error('settings', "Couldn't save a profile photo", { userId, error: e });
		return { error: "Couldn't save that photo. Try again." };
	}
	db.update(users).set({ avatarChoice: 'own', ownAvatarAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
	return null;
}

/** Back to the Google photo, or to initials; the photo they uploaded is deleted. */
export async function setAvatarChoice(userId: string, choice: 'google' | 'none') {
	db.update(users).set({ avatarChoice: choice, ownAvatarAt: null }).where(eq(users.id, userId)).run();
	await removeFiles([ownAvatarFile(userId)], 'settings');
}
