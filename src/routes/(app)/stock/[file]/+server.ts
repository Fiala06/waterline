import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stockDir, stockPhotoByFile } from '$lib/server/stock-photos';
import type { RequestHandler } from './$types';

// A species photo kept from Wikimedia Commons (signed in only, like the rest of the app).
export const GET: RequestHandler = async ({ params }) => {
	if (!/^[0-9a-f]{40}\.jpg$/.test(params.file) || !stockPhotoByFile(params.file)) error(404, 'Not found');
	let body: Buffer;
	try {
		body = await readFile(join(stockDir(), params.file));
	} catch {
		error(404, 'Not found');
	}
	return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
};
