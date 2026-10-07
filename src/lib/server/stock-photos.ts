// Species photos for plants and livestock, from Wikimedia Commons. The server
// looks a species up on Wikipedia the first time it's shown (the page's own
// photo, which is on Commons), checks on Commons that its license is free,
// and keeps a small copy in DATA_DIR/stock with the credit Commons asks for:
// who took it and the license. A cultivar (Java fern 'Trident') is looked for
// among Commons' files by its name, never shown as its species. Nothing is
// fetched by the browser. The admin turns it off in Server settings. STOCK_PHOTO_WIKI / STOCK_PHOTO_COMMONS
// point it at a stand-in in tests.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { count, desc, eq, inArray, ne } from 'drizzle-orm';
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
 * The name to look up: the scientific name without "sp." or a note, so
 * "Anubias sp." is the genus's page. A cultivar stays, in straight quotes:
 * "Microsorum pteropus 'Trident'" is looked for as itself, never shown as the
 * plain Java fern. The common name when there's no scientific one.
 */
export function lookupName(scientific: string | null | undefined, common: string | null | undefined): string | null {
	const clean = (s: string) => {
		const cultivar = /['"‘’“”]([^'"‘’“”]+)['"‘’“”]/.exec(s)?.[1]?.trim();
		const base = s
			.replace(/['"‘’“”][^'"‘’“”]*['"‘’“”]/g, ' ')
			.replace(/\([^)]*\)/g, ' ')
			.replace(/\bspp?\.?(?=\s|$)/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return base.length < 3 ? null : cultivar ? `${base} '${cultivar}'` : base;
	};
	return clean(scientific ?? '') ?? clean(common ?? '');
}

/** "Microsorum pteropus 'Trident'" is the species and its cultivar; null for a plain name. */
export function cultivarOf(name: string): { base: string; cultivar: string } | null {
	const m = /^(.+?) '([^']+)'$/.exec(name);
	return m ? { base: m[1], cultivar: m[2] } : null;
}

const words = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

/**
 * A photo of a cultivar, from the files on Commons: one whose name has the
 * genus and every word of the cultivar ("Microsorum_pteropus_Trident.jpg").
 * Wikipedia has no pages for cultivars, and the species' photo would be wrong.
 */
export function cultivarFile(titles: string[], base: string, cultivar: string): string | null {
	const need = [words(base)[0], ...words(cultivar)].filter((w): w is string => !!w);
	for (const t of titles) {
		const file = t.replace(/^File:/, '');
		if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
		const have = new Set(words(file.replace(/\.[a-z]+$/i, '')));
		if (need.every((w) => have.has(w))) return file;
	}
	return null;
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

/**
 * The Commons file a Wikipedia page's photo is; null for one only on Wikipedia
 * (those aren't free). Wikipedia adds "?utm_source=…" to the address, which
 * isn't part of the name.
 */
export function commonsFile(src: string): string | null {
	const m = /\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(src);
	return m ? decodeURIComponent(m[1]) : null;
}

type Found =
	| { status: 'ok'; file: string; width: number; height: number; author: string; license: string; licenseUrl: string | null; pageUrl: string }
	| { status: 'none' | 'failed'; reason: string };

/** Why a request went wrong, in a few words: "ENOTFOUND en.wikipedia.org", "timed out", "Wikipedia answered 403". */
export function failureReason(e: unknown): string {
	if (!(e instanceof Error)) return String(e).slice(0, 200);
	if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'timed out after 10 seconds';
	// fetch says "fetch failed"; what went wrong is its cause (DNS, a refused connection, a certificate)
	const cause = e.cause as { code?: string; message?: string; hostname?: string } | undefined;
	if (cause?.code) return `${cause.code}${cause.hostname ? ` ${cause.hostname}` : ''}`.slice(0, 200);
	if (cause?.message) return cause.message.slice(0, 200);
	return e.message.slice(0, 200);
}

/** What a site answered, with the start of its text when it isn't a success (Wikimedia says why it refused). */
async function answered(site: string, res: Response): Promise<Error> {
	let text = '';
	try {
		text = plainText((await res.text()).replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' '), 140);
	} catch {
		/* just the status */
	}
	return new Error(`${site} answered ${res.status}${text ? `: ${text}` : ''}`);
}

/** Look one name up and keep its photo. Never throws: a failure is `failed`, to try again later. */
export async function fetchStockPhoto(name: string, fetcher: typeof fetch = fetch): Promise<Found> {
	const get = (url: string) => fetcher(url, { headers: { 'user-agent': UA, 'api-user-agent': UA }, signal: AbortSignal.timeout(10_000) });
	try {
		let file: string | null;
		const cv = cultivarOf(name);
		if (cv) {
			// a cultivar: a file on Commons named for it, or none
			const sq = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', list: 'search', srnamespace: '6', srlimit: '20', srsearch: `${cv.base} ${cv.cultivar}` });
			const found = await get(`${COMMONS()}/w/api.php?${sq}`);
			if (!found.ok) throw await answered('Commons', found);
			const titles = ((await found.json()) as { query?: { search?: { title?: string }[] } }).query?.search?.map((r) => r.title ?? '') ?? [];
			file = cultivarFile(titles, cv.base, cv.cultivar);
			if (!file) return { status: 'none', reason: `No photo of ‘${cv.cultivar}’ on Commons` };
		} else {
			const page = await get(`${WIKI()}/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`);
			if (page.status === 404) return { status: 'none', reason: 'No Wikipedia page' };
			if (!page.ok) throw await answered('Wikipedia', page);
			const summary = (await page.json()) as { type?: string; originalimage?: { source?: string }; thumbnail?: { source?: string } };
			const src = summary.type === 'disambiguation' ? null : (summary.originalimage?.source ?? summary.thumbnail?.source ?? null);
			if (!src) return { status: 'none', reason: summary.type === 'disambiguation' ? 'Wikipedia has several pages by this name' : 'No photo on its Wikipedia page' };
			file = commonsFile(src);
			if (!file) return { status: 'none', reason: 'Its photo isn’t on Commons' };
		}

		// 500: one of the widths Commons keeps thumbnails at (it may refuse others)
		const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '500', titles: `File:${file}` });
		const info = await get(`${COMMONS()}/w/api.php?${q}`);
		if (!info.ok) throw await answered('Commons', info);
		type Meta = Record<string, { value?: string } | undefined>;
		const ii = ((await info.json()) as { query?: { pages?: { imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Meta }[] }[] } }).query?.pages?.[0]?.imageinfo?.[0];
		const license = plainText(ii?.extmetadata?.LicenseShortName?.value, 60);
		if (!ii) return { status: 'none', reason: 'Not found on Commons' };
		if (!freeLicense(license)) return { status: 'none', reason: `Its photo isn’t free to use (${license || 'no license'})` };
		const imageUrl = ii.thumburl ?? ii.url ?? '';
		// only Commons' own image servers (or the stand-in in tests)
		const host = new URL(imageUrl).origin;
		if (host !== 'https://upload.wikimedia.org' && host !== new URL(COMMONS()).origin) return { status: 'none', reason: `Not on Commons' image server (${host})` };

		const img = await get(imageUrl);
		if (!img.ok) throw await answered('Commons’ image server', img);
		const out = await sharp(Buffer.from(await img.arrayBuffer()))
			.rotate()
			.resize(480, 480, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 78, mozjpeg: true })
			.toBuffer({ resolveWithObject: true });
		await mkdir(stockDir(), { recursive: true });
		const saved = stockFile(name);
		await writeFile(join(stockDir(), saved), out.data);
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
		return { status: 'failed', reason: failureReason(e) };
	}
}

// one at a time, in the background, so a page never waits on Wikipedia
const queued = new Set<string>();
let running: Promise<void> | null = null;

/** Keep what a lookup found, or why it found nothing. */
function keep(name: string, found: Found) {
	const row = { file: null, width: null, height: null, author: null, license: null, licenseUrl: null, pageUrl: null, reason: null, ...found, name, fetchedAt: new Date().toISOString() };
	db.insert(stockPhotos).values(row).onConflictDoUpdate({ target: stockPhotos.name, set: row }).run();
}

function enqueue(names: string[]) {
	for (const n of names) queued.add(n);
	running ??= (async () => {
		// one warning for a batch that couldn't reach Wikipedia, not one per species
		const failed: { name: string; reason: string }[] = [];
		while (queued.size) {
			const name = queued.values().next().value!;
			try {
				const found = await fetchStockPhoto(name);
				keep(name, found);
				if (found.status === 'ok') logger.info('photos', `Species photo for ${name}, ${found.license}`);
				else if (found.status === 'failed') failed.push({ name, reason: found.reason });
				else logger.debug('photos', `No species photo for ${name}: ${found.reason}`);
			} catch (e) {
				logger.error('photos', `Couldn't keep the species photo for ${name}`, { error: e });
			}
			queued.delete(name);
		}
		if (failed.length)
			logger.warn('photos', `Couldn't get species photos from Wikipedia for ${failed.length === 1 ? failed[0].name : `${failed.length} species`}: ${failed[0].reason}. Trying again tomorrow.`, {
				species: failed.map((f) => f.name).slice(0, 20),
				reasons: [...new Set(failed.map((f) => f.reason))].slice(0, 5)
			});
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

/** For Server settings: how many were found, and the latest reason one couldn't be. */
export function stockPhotoStatus() {
	const by = new Map(db.select({ status: stockPhotos.status, n: count() }).from(stockPhotos).groupBy(stockPhotos.status).all().map((r) => [r.status, r.n]));
	const last = db.select({ reason: stockPhotos.reason }).from(stockPhotos).where(eq(stockPhotos.status, 'failed')).orderBy(desc(stockPhotos.fetchedAt)).limit(1).get();
	return { found: by.get('ok') ?? 0, none: by.get('none') ?? 0, failed: by.get('failed') ?? 0, pending: queued.size, reason: last?.reason ?? null };
}

/** A species every lookup should find, to see that Wikipedia can be reached. */
export const TEST_SPECIES = { name: 'Microsorum pteropus', common: 'Java fern' };

/**
 * Server settings' Look again now: forget every species without a photo, so
 * they're asked again as they're shown, and look one up now to say whether
 * Wikipedia can be reached from this server.
 */
export async function lookAgain(fetcher: typeof fetch = fetch): Promise<Found> {
	db.delete(stockPhotos).where(ne(stockPhotos.status, 'ok')).run();
	const found = await fetchStockPhoto(TEST_SPECIES.name, fetcher);
	keep(TEST_SPECIES.name, found);
	if (found.status === 'failed') logger.warn('photos', `Couldn't reach Wikipedia for species photos: ${found.reason}`);
	else logger.info('photos', found.status === 'ok' ? `Species photos: Wikipedia works (${TEST_SPECIES.name}, ${found.license})` : `Species photos: ${TEST_SPECIES.name}: ${found.reason}`);
	return found;
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
