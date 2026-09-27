import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AVATAR_SIZE, avatarImage, largerGooglePhoto } from './avatar-image';

describe('profile photos', () => {
	it('keeps a square, small JPEG of any photo', async () => {
		const wide = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#2a8c84' } }).png().toBuffer();
		const meta = await sharp(await avatarImage(wide)).metadata();
		expect(meta).toMatchObject({ format: 'jpeg', width: AVATAR_SIZE, height: AVATAR_SIZE });
	});

	it("refuses what isn't an image", async () => {
		await expect(avatarImage(Buffer.from('not an image'))).rejects.toThrow();
	});

	it("asks Google for a larger photo than it offers", () => {
		expect(largerGooglePhoto('https://lh3.googleusercontent.com/a/ACg8ocK123=s96-c')).toBe('https://lh3.googleusercontent.com/a/ACg8ocK123=s256-c');
		expect(largerGooglePhoto('https://example.com/me.jpg')).toBe('https://example.com/me.jpg');
	});
});
