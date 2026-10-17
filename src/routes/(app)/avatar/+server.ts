import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { avatarFile, ownAvatarFile } from '$lib/server/avatar';
import { shownAvatar } from '$lib/server/avatar-image';
import type { RequestHandler } from './$types';

/** Your own profile photo (the address changes when the photo does, so it can be cached for good). */
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user!;
	const shown = shownAvatar(user);
	let img: Buffer;
	try {
		if (!shown) throw new Error();
		img = await readFile(shown.kind === 'own' ? ownAvatarFile(user.id) : avatarFile(user.id));
	} catch {
		error(404, 'No photo');
	}
	return new Response(new Uint8Array(img), {
		headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' }
	});
};
