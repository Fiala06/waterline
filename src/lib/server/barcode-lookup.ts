// What a scanned barcode is (#147), from the product databases, asked by this
// server (never the browser) once per barcode and kept in barcode_lookups:
// Open Products Facts first (open data, ODbL), then UPCitemdb's free lookup
// (100 a day for the server's address, no account). The admin turns it off in
// Server settings. BARCODE_OPF_URL / BARCODE_UPCITEMDB_URL point it at a
// stand-in in tests.
import { and, eq, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { equipmentName } from '$lib/equipment';
import { db } from './db';
import { barcodeLookups, equipment, tanks, type BarcodeLookup } from './db/schema';
import { getServerSettings } from './mail';
import { visibleTo } from './members';
import { failureReason } from './stock-photos';

const OPF = () => (env.BARCODE_OPF_URL || 'https://world.openproductsfacts.org').replace(/\/+$/, '');
const UPCITEMDB = () => (env.BARCODE_UPCITEMDB_URL || 'https://api.upcitemdb.com').replace(/\/+$/, '');
/** the databases ask every client to say who it is */
const UA = 'Waterline/1 (self-hosted aquarium log; https://github.com/Fiala06/waterline)';
const MINUTE = 60_000;
const DAY = 86_400_000;
/** asked again after: nothing found (a month: products get added), a database that couldn't answer (10 minutes) */
const RETRY = { none: 30 * DAY, failed: 10 * MINUTE };

export const barcodeLookupOn = () => env.BARCODE_LOOKUP !== 'off' && getServerSettings().barcodeLookup;

export type Found =
	| { status: 'ok'; title: string; brand: string | null; category: string | null; source: string; sourceUrl: string | null }
	| { status: 'none' | 'failed'; reason: string };

/** One database's answer: what it has, that it hasn't got it, or why it couldn't say. */
type Answer = { found: Extract<Found, { status: 'ok' }> } | { none: true } | { failed: string };

const get = (fetcher: typeof fetch, url: string) => fetcher(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
const text = (s: string | undefined | null, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;

/** Open Products Facts: the non-food part of Open Food Facts. */
async function openProductsFacts(code: string, fetcher: typeof fetch): Promise<Answer> {
	const res = await get(fetcher, `${OPF()}/api/v2/product/${code}.json?fields=product_name,brands,categories`);
	if (res.status === 404) return { none: true };
	if (!res.ok) return { failed: `Open Products Facts answered ${res.status}` };
	const body = (await res.json()) as { status?: number; product?: { product_name?: string; brands?: string; categories?: string } };
	const title = text(body.product?.product_name, 200);
	if (!body.status || !title) return { none: true };
	return {
		found: {
			status: 'ok',
			title,
			brand: text(body.product?.brands?.split(',')[0], 60),
			category: text(body.product?.categories, 200),
			source: 'Open Products Facts',
			sourceUrl: `https://world.openproductsfacts.org/product/${code}`
		}
	};
}

/** UPCitemdb's free lookup: no account, 100 a day for the server's address. */
async function upcitemdb(code: string, fetcher: typeof fetch): Promise<Answer> {
	const res = await get(fetcher, `${UPCITEMDB()}/prod/trial/lookup?upc=${code}`);
	if (res.status === 429) return { failed: "UPCitemdb's free lookups for this server's address are used up for today (100 a day)" };
	if (res.status === 404) return { none: true };
	if (!res.ok) return { failed: `UPCitemdb answered ${res.status}` };
	const body = (await res.json()) as { items?: { title?: string; brand?: string; category?: string }[] };
	const item = body.items?.find((i) => text(i.title, 200));
	if (!item) return { none: true };
	return {
		found: { status: 'ok', title: text(item.title, 200)!, brand: text(item.brand, 60), category: text(item.category, 200), source: 'UPCitemdb', sourceUrl: `https://www.upcitemdb.com/upc/${code}` }
	};
}

/** Ask the databases in turn. Never throws: a database that couldn't answer makes the lookup `failed`, to try again soon. */
export async function fetchBarcode(code: string, fetcher: typeof fetch = fetch): Promise<Found> {
	const failures: string[] = [];
	for (const ask of [openProductsFacts, upcitemdb]) {
		try {
			const a = await ask(code, fetcher);
			if ('found' in a) return a.found;
			if ('failed' in a) failures.push(a.failed);
		} catch (e) {
			failures.push(failureReason(e));
		}
	}
	if (failures.length) return { status: 'failed', reason: failures.join('; ').slice(0, 300) };
	return { status: 'none', reason: 'Not in Open Products Facts or UPCitemdb' };
}

/** Whether a kept answer still holds: a product always, nothing found for a month, a failure for 10 minutes. */
export function fresh(row: Pick<BarcodeLookup, 'status' | 'fetchedAt'>, now = Date.now()): boolean {
	if (row.status === 'ok') return true;
	return now - Date.parse(row.fetchedAt) < RETRY[row.status];
}

/** The kept answer for a barcode, whatever it was; null when never asked. */
export function cachedBarcode(code: string): BarcodeLookup | null {
	return db.select().from(barcodeLookups).where(eq(barcodeLookups.code, code)).get() ?? null;
}

/** Whether a lookup would ask the databases (nothing kept, or kept answer run out). */
export function needsFetch(code: string, now = Date.now()): boolean {
	const row = cachedBarcode(code);
	return !row || !fresh(row, now);
}

function fromRow(row: BarcodeLookup): Found {
	if (row.status === 'ok') return { status: 'ok', title: row.title ?? '', brand: row.brand, category: row.category, source: row.source ?? 'a product database', sourceUrl: row.sourceUrl };
	return { status: row.status, reason: row.reason ?? '' };
}

/** Keep what a lookup found, or why it found nothing. */
export function keep(code: string, found: Found) {
	const row = { title: null, brand: null, category: null, source: null, sourceUrl: null, reason: null, ...found, code, fetchedAt: new Date().toISOString() };
	db.insert(barcodeLookups).values(row).onConflictDoUpdate({ target: barcodeLookups.code, set: row }).run();
}

/** What a barcode is: the kept answer while it holds, else asked of the databases now and kept. */
export async function lookupBarcode(code: string, fetcher: typeof fetch = fetch): Promise<Found> {
	const row = cachedBarcode(code);
	if (row && fresh(row)) return fromRow(row);
	const found = await fetchBarcode(code, fetcher);
	keep(code, found);
	return found;
}

/** The keeper's equipment with this barcode, still in a tank, with the tank's name: a scanned box that's already added. */
export function equipmentWithBarcode(userId: string, code: string) {
	return db
		.select({ e: equipment, tankName: tanks.name })
		.from(equipment)
		.innerJoin(tanks, eq(tanks.id, equipment.tankId))
		.where(and(eq(equipment.barcode, code), isNull(equipment.removedAt), visibleTo(userId)))
		.all()
		.map((r) => ({ id: r.e.id, tankId: r.e.tankId, tankName: r.tankName, name: equipmentName(r.e) }));
}
