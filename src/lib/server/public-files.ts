import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { photoFilePath, type Photo } from './photos';

/** Serve a photo file to the public (no private caching headers). */
export async function servePhoto(p: Photo, size: 'full' | 'thumb') {
	let body: Buffer;
	try {
		body = await readFile(photoFilePath(p, size));
	} catch {
		error(404, 'Not found');
	}
	return new Response(new Uint8Array(body), {
		headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' }
	});
}
