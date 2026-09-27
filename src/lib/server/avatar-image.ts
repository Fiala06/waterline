// A profile photo as the app keeps it: square, 192px (sharp enough for the
// account menu on any screen), JPEG. No database here, so it can be tested.
import sharp from 'sharp';

export const AVATAR_SIZE = 192;

export async function avatarImage(input: Buffer): Promise<Buffer> {
	return sharp(input, { failOn: 'error', limitInputPixels: 40_000_000 })
		.rotate()
		.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
		.jpeg({ quality: 82 })
		.toBuffer();
}

export type AvatarChoice = 'google' | 'own' | 'none';

/**
 * The photo an account shows: the one they uploaded, the Google one, or none
 * (initials). `at` is when that photo was saved, for its address.
 */
export function shownAvatar(u: { avatarChoice: AvatarChoice; avatarAt: string | null; ownAvatarAt: string | null }) {
	if (u.avatarChoice === 'own' && u.ownAvatarAt) return { kind: 'own' as const, at: u.ownAvatarAt };
	if (u.avatarChoice === 'google' && u.avatarAt) return { kind: 'google' as const, at: u.avatarAt };
	return null;
}

/** Google's photo address asks for 96px; ask for a size that's still sharp at 192. */
export const largerGooglePhoto = (url: string) => url.replace(/=s\d+(-c)?$/, '=s256-c');
