import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The medium size (#243): made from the full photo the first time it's asked
// for, kept beside it, removed with it; a small photo is served as it is.
const dir = mkdtempSync(join(tmpdir(), 'wl-photo-sizes-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const sharp = (await import('sharp')).default;
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { deletePhoto, MEDIUM, photoFile, photoFilePath, photoSizes, preparePhotos, storePhotos } = await import('./photos');

const user = upsertUser({ email: 'sizes@example.com', name: 'Sizes', googleSub: 'g-sizes' });
const tank = createTank(user, { name: 'Sizes tank', type: 'planted', nominalVolumeL: 100 });
async function upload(width: number, height: number) {
	const buf = await sharp({ create: { width, height, channels: 3, background: '#2a8c84' } }).jpeg().toBuffer();
	const prepared = await preparePhotos([new File([new Uint8Array(buf)], 'tank.jpg', { type: 'image/jpeg' })]);
	if ('error' in prepared) throw new Error(prepared.error);
	const [p] = await storePhotos(tank.id, prepared, { takenAt: new Date().toISOString() });
	return p;
}

describe('the medium size of a photo (#243)', () => {
	it('is made once, at most 1024 px on its longer edge, and kept', async () => {
		const p = await upload(3000, 2000);
		expect(existsSync(photoFilePath(p, 'medium'))).toBe(false);
		const medium = await photoFile(p, 'medium');
		const meta = await sharp(medium).metadata();
		expect(Math.max(meta.width!, meta.height!)).toBe(MEDIUM);
		expect(medium.length).toBeLessThan((await photoFile(p, 'full')).length);
		expect(existsSync(photoFilePath(p, 'medium'))).toBe(true);
		expect(photoSizes([p.id, null, p.id]).get(p.id)).toEqual({ width: 2048, height: 1365 });
		await deletePhoto(user.id, p.id);
		expect(existsSync(photoFilePath(p, 'medium'))).toBe(false);
		expect(existsSync(photoFilePath(p, 'full'))).toBe(false);
	});

	it('is the photo itself when it is no bigger than that', async () => {
		const p = await upload(800, 600);
		expect(await photoFile(p, 'medium')).toEqual(await photoFile(p, 'full'));
		expect(existsSync(photoFilePath(p, 'medium'))).toBe(false);
	});
});
