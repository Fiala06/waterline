// Species photos on a public tank page and the sample tank: the Wikimedia Commons
// photos the app already keeps for each species (stock-photos.ts), served from the
// page's own address so a visitor needs no sign-in. Only the page's own species are
// served, never a keeper's own photo of an animal or plant, and none when the admin
// has species photos off.
import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { livestock, plants, type PublicPage, type Tank } from './db/schema';
import { lookupName, stockDir, stockPhotoByFile, stockPhotosFor, stockPhotosOn, type StockPhoto } from './stock-photos';

export interface PublicSpeciesPhoto {
	src: string;
	/** who took it and its license, as Commons asks */
	credit: Omit<StockPhoto, 'url'>;
}

/** The kept photos for these species names, by name, each at `<base>/species/<file>`. */
export function publicSpeciesPhotos(names: (string | null)[], base: string): Record<string, PublicSpeciesPhoto> {
	const out: Record<string, PublicSpeciesPhoto> = {};
	for (const [name, { url, ...credit }] of stockPhotosFor(names).photos) out[name] = { src: `${base}/species/${url.split('/').pop()}`, credit };
	return out;
}

/** The species names a public page shows: its livestock and plants, when livestock is public. */
export function tankSpeciesNames(page: PublicPage, tank: Tank): string[] {
	if (!page.showLivestock) return [];
	const animals = db
		.select({ s: livestock.scientificName, c: livestock.commonName })
		.from(livestock)
		.where(and(eq(livestock.tankId, tank.id), isNull(livestock.removedAt), eq(livestock.status, 'in_tank')))
		.all();
	const green = db.select({ s: plants.scientificName, c: plants.name }).from(plants).where(and(eq(plants.tankId, tank.id), isNull(plants.removedAt))).all();
	return [...animals, ...green].map((r) => lookupName(r.s, r.c)).filter((n): n is string => !!n);
}

/** One kept photo, when it's one of these species'. */
export async function serveSpeciesPhoto(names: string[], file: string): Promise<Response> {
	if (!stockPhotosOn() || !/^[0-9a-f]{40}\.jpg$/.test(file)) error(404, 'Not found');
	const row = stockPhotoByFile(file);
	if (!row || row.status !== 'ok' || !names.includes(row.name)) error(404, 'Not found');
	let body: Buffer;
	try {
		body = await readFile(join(stockDir(), file));
	} catch {
		error(404, 'Not found');
	}
	return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
}
