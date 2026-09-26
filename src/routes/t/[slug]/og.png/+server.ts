import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { photos } from '$lib/server/db/schema';
import { tankCard } from '$lib/server/og';
import { findPublic, ogVersion, publicSettings, publicView } from '$lib/server/public';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const { page, tank, user } = findPublic(params.slug);
	const view = publicView(page, tank, user);
	const coverId = page.ogPhotoId ?? tank.coverPhotoId;
	const cover = coverId ? (db.select().from(photos).where(eq(photos.id, coverId)).get() ?? null) : null;
	const base = publicSettings().baseUrl ?? url.origin;
	const png = await tankCard(view, { cover, plain: page.ogPlain, host: new URL(base).host, version: ogVersion(page, tank) });
	return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
