import { error } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stockDir, stockPhotoByFile } from '$lib/server/stock-photos';
import type { RequestHandler } from './$types';

// A species photo kept from Wikimedia Commons (signed in only, like the rest of the app).
export const GET: RequestHandler = ({ params }) => {
	if (!/^[0-9a-f]{40}\.jpg$/.test(params.file) || !stockPhotoByFile(params.file)) error(404, 'Not found');
	let body: Buffer;
	try {
		body = readFileSync(join(stockDir(), params.file));
	} catch {
		error(404, 'Not found');
	}
	return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
};
