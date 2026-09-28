// Species photos for plants and livestock, from Wikimedia Commons. The server
// looks a species up on Wikipedia the first time it's shown (the page's own
// photo, which is on Commons), checks on Commons that its license is free,
// and keeps a small copy in DATA_DIR/stock with the credit Commons asks for:
// who took it and the license. Nothing is fetched by the browser. The admin
// turns it off in Server settings. STOCK_PHOTO_WIKI / STOCK_PHOTO_COMMONS
// point it at a stand-in in tests.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { stockPhotos } from './db/schema';
import { dataDir } from './instance';
import { logger } from './log';
import { getServerSettings } from './mail';
import { photoUrl } from '$lib/media';

const WIKI = () => (env.STOCK_PHOTO_WIKI || 'https://en.wikipedia.org').replace(/\/+$/, '');
const COMMONS = () => (env.STOCK_PHOTO_COMMONS || 'https://commons.wikimedia.org').replace(/\/+$/, '');
/** Wikimedia asks every client to say who it is */
const UA = 'Waterline/1 (self-hosted aquarium log; https://github.com/Fiala06/waterline)';
const DAY = 86_400_000;
/** asked again after: no free photo (a month), couldn't reach Wikipedia (a day) */
const RETRY = { none: 30 * DAY, failed: DAY };

export const stockDir = () => join(dataDir(), 'stock');
export const stockFile = (name: string) => `${createHash('sha1').update(name).digest('hex')}.jpg`;

/**
 * The name to look up: the scientific name without a cultivar or "sp.", so
 * "Microsorum pteropus 'Trident'" is the Java fern's page and "Anubias sp." is
 * the genus's. The common name when there's no scientific one.
 */
export function lookupName(scientific: string | null | undefined, common: string | null | undefined): string | null {
	const clean = (s: string) =>
		s
			.replace(/['"‘’“”][^'"‘’“”]*['"‘’“”]/g, ' ')
			.replace(/\([^)]*\)/g, ' ')
			.replace(/\bspp?\.?(?=\s|$)/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	const s = clean(scientific ?? '');
	if (s.length >= 3) return s;
	const c = clean(common ?? '');
	return c.length >= 3 ? c : null;
}

/** Commons' licenses that are free to show with credit; not NonCommercial, NoDerivatives or fair use. */
export function freeLicense(license: string): boolean {
	const l = license.trim();
	if (!l || /\b(nc|nd)\b|non-?commercial|no ?deriv|non-?free|fair use/i.test(l)) return false;
	return /^(cc0|cc[- ]?zero|public domain|pd\b|cc[- ]by(-sa)?\b|gfdl|attribution|no restrictions|free art license)/i.test(l);
}

/** Commons' credit fields are HTML: "<a href=…>Jane Doe</a>" is "Jane Doe". */
export function plainText(html: string | null | undefined, max = 120): string {
	return (html ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

/** The Commons file a Wikipedia page's photo is; null for one only on Wikipedia (those aren't free). */
export function commonsFile(src: string): string | null {
	const m = /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(src);
	return m ? decodeURIComponent(m[1]) : null;
}

type Found = { status: 'ok'; file: string; width: number; height: number; author: string; license: string; licenseUrl: string | null; pageUrl: string } | { status: 'none' | 'failed' };

/** Look one name up and keep its photo. Never throws: a failure is `failed`, to try again later. */
export async function fetchStockPhoto(name: string, fetcher: typeof fetch = fetch): Promise<Found> {
	const get = (url: string) => fetcher(url, { headers: { 'user-agent': UA, 'api-user-agent': UA }, signal: AbortSignal.timeout(10_000) });
	try {
		const page = await get(`${WIKI()}/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`);
		if (page.status === 404) return { status: 'none' };
		if (!page.ok) throw new Error(`Wikipedia answered ${page.status}`);
		const summary = (await page.json()) as { type?: string; originalimage?: { source?: string }; thumbnail?: { source?: string } };
		const src = summary.type === 'disambiguation' ? null : (summary.originalimage?.source ?? summary.thumbnail?.source ?? null);
		const file = src ? commonsFile(src) : null;
		if (!file) return { status: 'none' };

		const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480', titles: `File:${file}` });
		const info = await get(`${COMMONS()}/w/api.php?${q}`);
		if (!info.ok) throw new Error(`Commons answered ${info.status}`);
		type Meta = Record<string, { value?: string } | undefined>;
		const ii = ((await info.json()) as { query?: { pages?: { imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Meta }[] }[] } }).query?.pages?.[0]?.imageinfo?.[0];
		const license = plainText(ii?.extmetadata?.LicenseShortName?.value, 60);
		if (!ii || !freeLicense(license)) return { status: 'none' };
		const imageUrl = ii.thumburl ?? ii.url ?? '';
		// only Commons' own image servers (or the stand-in in tests)
		const host = new URL(imageUrl).origin;
		if (host !== 'https://upload.wikimedia.org' && host !== new URL(COMMONS()).origin) return { status: 'none' };

		const img = await get(imageUrl);
		if (!img.ok) throw new Error(`The image answered ${img.status}`);
		const out = await sharp(Buffer.from(await img.arrayBuffer()))
			.rotate()
			.resize(480, 480, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 78, mozjpeg: true })
			.toBuffer({ resolveWithObject: true });
		mkdirSync(stockDir(), { recursive: true });
		const saved = stockFile(name);
		writeFileSync(join(stockDir(), saved), out.data);
		return {
			status: 'ok',
			file: saved,
			width: out.info.width,
			height: out.info.height,
			author: plainText(ii.extmetadata?.Artist?.value) || 'Unknown',
			license,
			licenseUrl: ii.extmetadata?.LicenseUrl?.value?.startsWith('http') ? ii.extmetadata.LicenseUrl.value : null,
			pageUrl: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`
		};
	} catch (e) {
		logger.debug('photos', `Couldn't get a species photo for ${name}`, { error: e });
		return { status: 'failed' };
	}
}

// one at a time, in the background, so a page never waits on Wikipedia
const queued = new Set<string>();
let running: Promise<void> | null = null;

function enqueue(names: string[]) {
	for (const n of names) queued.add(n);
	running ??= (async () => {
		while (queued.size) {
			const name = queued.values().next().value!;
			const found = await fetchStockPhoto(name);
			const row = { name, fetchedAt: new Date().toISOString(), ...found };
			db.insert(stockPhotos).values(row).onConflictDoUpdate({ target: stockPhotos.name, set: row }).run();
			if (found.status === 'ok') logger.info('photos', `Species photo for ${name}, ${found.license}`);
			queued.delete(name);
		}
	})().finally(() => (running = null));
}

export interface StockPhoto {
	url: string;
	author: string;
	license: string;
	licenseUrl: string | null;
	pageUrl: string;
}

export const stockPhotosOn = () => env.STOCK_PHOTOS !== 'off' && getServerSettings().stockPhotos;

/**
 * The species photos for these names, those already kept. Any not looked up
 * yet (or due another try) are fetched in the background; `pending` says some
 * are on their way, so the page can look again in a moment.
 */
export function stockPhotosFor(names: (string | null)[]): { photos: Map<string, StockPhoto>; pending: boolean } {
	const photos = new Map<string, StockPhoto>();
	const want = [...new Set(names.filter((n): n is string => !!n))];
	if (!want.length || !stockPhotosOn()) return { photos, pending: false };
	const rows = new Map(db.select().from(stockPhotos).where(inArray(stockPhotos.name, want)).all().map((r) => [r.name, r]));
	const now = Date.now();
	const due: string[] = [];
	for (const name of want) {
		const r = rows.get(name);
		if (r?.status === 'ok' && r.file) {
			photos.set(name, { url: `/stock/${r.file}`, author: r.author ?? 'Unknown', license: r.license ?? '', licenseUrl: r.licenseUrl, pageUrl: r.pageUrl ?? '' });
		} else if (!r || now - Date.parse(r.fetchedAt) > RETRY[r.status === 'none' ? 'none' : 'failed']) due.push(name);
	}
	const fresh = due.filter((n) => !queued.has(n));
	if (fresh.length) enqueue(fresh);
	return { photos, pending: due.length > 0 };
}

/** A kept photo's row, for the image route. */
export const stockPhotoByFile = (file: string) => db.select().from(stockPhotos).where(eq(stockPhotos.file, file)).get();

/** What a plant or animal shows: the keeper's own photo, else the species photo with its credit. */
export interface SpeciesPhoto {
	/** small, for a card or a row */
	src: string;
	/** larger, for its sheet or page */
	large: string;
	/** a species photo's credit; null for the keeper's own */
	credit: Omit<StockPhoto, 'url'> | null;
}

export function speciesPhotos(items: { photoId: string | null; scientific: string | null; common: string | null }[]) {
	const names = items.map((i) => (i.photoId ? null : lookupName(i.scientific, i.common)));
	const { photos, pending } = stockPhotosFor(names);
	const list = items.map((i, n): SpeciesPhoto | null => {
		if (i.photoId) return { src: photoUrl(i.photoId, 'thumb'), large: photoUrl(i.photoId, 'full'), credit: null };
		const s = names[n] ? photos.get(names[n]!) : undefined;
		if (!s) return null;
		const { url, ...credit } = s;
		return { src: url, large: url, credit };
	});
	return { list, pending };
}
