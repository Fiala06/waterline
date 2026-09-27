import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AVATAR_SIZE, avatarImage, largerGooglePhoto, shownAvatar } from './avatar-image';

describe('profile photos', () => {
	it('keeps a square, small JPEG of any photo', async () => {
		const wide = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#2a8c84' } }).png().toBuffer();
		const meta = await sharp(await avatarImage(wide)).metadata();
		expect(meta).toMatchObject({ format: 'jpeg', width: AVATAR_SIZE, height: AVATAR_SIZE });
	});

	it('drops what the photo says about itself, location included', async () => {
		const tagged = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#2a8c84' } })
			.withMetadata({ exif: { IFD0: { Artist: 'Someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '45/1 30/1 0/1' } } })
			.jpeg()
			.toBuffer();
		expect((await sharp(tagged).metadata()).exif).toBeDefined();
		expect((await sharp(await avatarImage(tagged)).metadata()).exif).toBeUndefined();
	});

	it("refuses what isn't an image", async () => {
		await expect(avatarImage(Buffer.from('not an image'))).rejects.toThrow();
	});

	it("asks Google for a larger photo than it offers", () => {
		expect(largerGooglePhoto('https://lh3.googleusercontent.com/a/ACg8ocK123=s96-c')).toBe('https://lh3.googleusercontent.com/a/ACg8ocK123=s256-c');
		expect(largerGooglePhoto('https://example.com/me.jpg')).toBe('https://example.com/me.jpg');
	});
});

describe('which photo an account shows', () => {
	const google = '2026-09-20T10:00:00.000Z';
	const own = '2026-09-27T10:00:00.000Z';

	it('shows an uploaded photo over the Google one', () => {
		expect(shownAvatar({ avatarChoice: 'own', avatarAt: google, ownAvatarAt: own })).toEqual({ kind: 'own', at: own });
	});

	it('shows the Google photo by default, and initials without one', () => {
		expect(shownAvatar({ avatarChoice: 'google', avatarAt: google, ownAvatarAt: null })).toEqual({ kind: 'google', at: google });
		expect(shownAvatar({ avatarChoice: 'google', avatarAt: null, ownAvatarAt: null })).toBeNull();
	});

	it('shows initials once the photo is removed, even with a Google photo', () => {
		expect(shownAvatar({ avatarChoice: 'none', avatarAt: google, ownAvatarAt: null })).toBeNull();
	});

	it('shows no photo when an uploaded one is missing', () => {
		expect(shownAvatar({ avatarChoice: 'own', avatarAt: google, ownAvatarAt: null })).toBeNull();
	});
});
