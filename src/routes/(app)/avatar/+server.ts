import { error } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';
import { avatarFile } from '$lib/server/avatar';
import type { RequestHandler } from './$types';

/** Your own profile photo (the address changes when the photo does, so it can be cached for good). */
export const GET: RequestHandler = ({ locals }) => {
	const user = locals.user!;
	let img: Buffer;
	try {
		if (!user.avatarAt) throw new Error();
		img = readFileSync(avatarFile(user.id));
	} catch {
		error(404, 'No photo');
	}
	return new Response(new Uint8Array(img), {
		headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' }
	});
};
