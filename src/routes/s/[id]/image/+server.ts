import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { photos } from '$lib/server/db/schema';
import { findShare } from '$lib/server/public';
import { servePhoto } from '$lib/server/public-files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const share = findShare(params.id);
	return servePhoto(db.select().from(photos).where(eq(photos.id, share.photoId)).get()!, 'full');
};
