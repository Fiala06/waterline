import { error } from '@sveltejs/kit';
import { photoFile, type Photo, type PhotoSize } from './photos';

/** The size a photo URL asks for (?size=thumb, ?size=medium), full otherwise. */
export const sizeParam = (v: string | null): PhotoSize => (v === 'thumb' || v === 'medium' ? v : 'full');

/** Serve a photo file to the public (no private caching headers). */
export async function servePhoto(p: Photo, size: PhotoSize) {
	let body: Buffer;
	try {
		body = await photoFile(p, size);
	} catch {
		error(404, 'Not found');
	}
	return new Response(new Uint8Array(body), {
		headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' }
	});
}
