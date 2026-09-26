import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { photos } from '$lib/server/db/schema';
import { photoCard } from '$lib/server/og';
import { findShare } from '$lib/server/public';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const share = findShare(params.id);
	const photo = db.select().from(photos).where(eq(photos.id, share.photoId)).get()!;
	const png = await photoCard(share, photo);
	return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
