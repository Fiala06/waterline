import { error } from '@sveltejs/kit';
import { getPhoto, photoFile } from '$lib/server/photos';
import { sizeParam } from '$lib/server/public-files';
import type { RequestHandler } from './$types';

// Photo files for the signed-in owner. Photos never change once written,
// so they can be cached privately for a long time.
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401);
	const photo = getPhoto(locals.user.id, params.id);
	const size = sizeParam(url.searchParams.get('size'));
	let body: Buffer;
	try {
		body = await photoFile(photo, size);
	} catch {
		error(404, 'Photo file missing');
	}
	const headers: Record<string, string> = {
		'content-type': 'image/jpeg',
		'cache-control': 'private, max-age=31536000, immutable',
		'x-content-type-options': 'nosniff'
	};
	if (url.searchParams.has('download')) {
		headers['content-disposition'] = `attachment; filename="waterline-${photo.takenAt.slice(0, 10)}-${photo.id.slice(0, 8)}.jpg"`;
	}
	return new Response(new Uint8Array(body), { headers });
};
