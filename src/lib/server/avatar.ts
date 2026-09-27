// Your profile photo, copied from your Google account at each Google sign-in
// into DATA_DIR/avatars, so browsers never load it from Google (it stays
// private, and it works offline). Without one, the account menu shows initials.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { avatarImage, largerGooglePhoto } from './avatar-image';
import { db } from './db';
import { users } from './db/schema';
import { dataDir } from './instance';
import { logger } from './log';

const MAX_BYTES = 5_000_000;
export const avatarFile = (userId: string) => join(dataDir(), 'avatars', `${userId}.jpg`);

/** Copy the photo in the background; sign-in doesn't wait for it, and a failure only means initials. */
export async function copyGoogleAvatar(userId: string, url: string) {
	try {
		if (!url.startsWith('https://')) return;
		const res = await fetch(largerGooglePhoto(url), { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('The photo is too large');
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > MAX_BYTES) throw new Error('The photo is too large');
		const img = await avatarImage(buf);
		mkdirSync(join(dataDir(), 'avatars'), { recursive: true });
		writeFileSync(avatarFile(userId), img);
		db.update(users).set({ avatarAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
	} catch (e) {
		logger.warn('sign-in', "Couldn't copy the Google profile photo", { userId, error: e });
	}
}
