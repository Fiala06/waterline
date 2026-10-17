import { describe, expect, it, vi } from 'vitest';

// nothing here needs the database: the lookups are asked with a fake fetcher
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('./db', () => ({ db: {} }));
vi.mock('./mail', () => ({ getServerSettings: () => ({ barcodeLookup: true, stockPhotos: true }) }));
const { fetchBarcode, fresh } = await import('./barcode-lookup');

type Reply = { status?: number; body?: unknown } | Error;
/** A fetcher answering Open Products Facts and UPCitemdb as told, noting what was asked. */
function fake(opf: Reply, upc: Reply) {
	const calls: string[] = [];
	const fetcher = (async (url: string) => {
		calls.push(url);
		const r = url.includes('openproductsfacts') ? opf : upc;
		if (r instanceof Error) throw r;
		return r.body === undefined ? new Response('', { status: r.status ?? 200 }) : Response.json(r.body, { status: r.status ?? 200 });
	}) as unknown as typeof fetch;
	return { fetcher, calls };
}

describe('fetchBarcode', () => {
	it('takes what Open Products Facts has, and asks nothing else', async () => {
		const { fetcher, calls } = fake({ body: { status: 1, product: { product_name: 'Prime', brands: 'Seachem, Seachem Laboratories', categories: 'Water conditioners' } } }, {});
		expect(await fetchBarcode('0000116043601', fetcher)).toEqual({
			status: 'ok',
			title: 'Prime',
			brand: 'Seachem',
			category: 'Water conditioners',
			source: 'Open Products Facts',
			sourceUrl: 'https://world.openproductsfacts.org/product/0000116043601'
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe('https://world.openproductsfacts.org/api/v2/product/0000116043601.json?fields=product_name,brands,categories');
	});
	it('asks UPCitemdb when Open Products Facts has nothing (a 404, or a product without a name)', async () => {
		const item = { title: 'Fluval 407 Performance Canister Filter, Aquarium Filter for up to 100 Gallons', brand: 'FLUVAL', category: 'Pet Supplies > Fish Supplies > Aquarium Filters' };
		const { fetcher, calls } = fake({ status: 404, body: { status: 0, status_verbose: 'product not found' } }, { body: { code: 'OK', total: 1, items: [item] } });
		const found = await fetchBarcode('0015561104470', fetcher);
		expect(found).toMatchObject({ status: 'ok', title: item.title, brand: 'FLUVAL', category: item.category, source: 'UPCitemdb', sourceUrl: 'https://www.upcitemdb.com/upc/0015561104470' });
		expect(calls[1]).toBe('https://api.upcitemdb.com/prod/trial/lookup?upc=0015561104470');
		const nameless = fake({ body: { status: 1, product: { product_name: '' } } }, { body: { code: 'OK', total: 1, items: [item] } });
		expect(await fetchBarcode('0015561104470', nameless.fetcher)).toMatchObject({ source: 'UPCitemdb' });
	});
	it('says when neither has it', async () => {
		const { fetcher } = fake({ status: 404 }, { body: { code: 'OK', total: 0, items: [] } });
		expect(await fetchBarcode('4006381333931', fetcher)).toEqual({ status: 'none', reason: 'Not in Open Products Facts or UPCitemdb' });
		const invalid = fake({ status: 404 }, { status: 404, body: { code: 'INVALID_UPC' } });
		expect(await fetchBarcode('4006381333931', invalid.fetcher)).toMatchObject({ status: 'none' });
	});
	it("is a failure (to try again soon) when a database couldn't answer, with why", async () => {
		const down = fake({ status: 503 }, { body: { code: 'OK', total: 0, items: [] } });
		expect(await fetchBarcode('4006381333931', down.fetcher)).toEqual({ status: 'failed', reason: 'Open Products Facts answered 503' });
		const limit = fake({ status: 404 }, { status: 429, body: { code: 'EXCEED_LIMIT' } });
		expect(await fetchBarcode('4006381333931', limit.fetcher)).toEqual({ status: 'failed', reason: "UPCitemdb's free lookups for this server's address are used up for today (100 a day)" });
		const offline = fake(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND', hostname: 'world.openproductsfacts.org' } }), Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND', hostname: 'api.upcitemdb.com' } }));
		expect(await fetchBarcode('4006381333931', offline.fetcher)).toEqual({ status: 'failed', reason: 'ENOTFOUND world.openproductsfacts.org; ENOTFOUND api.upcitemdb.com' });
	});
});

describe('fresh', () => {
	it('keeps a product for good, nothing found for a month and a failure for 10 minutes', () => {
		const at = Date.parse('2026-10-13T12:00:00Z');
		const row = (status: 'ok' | 'none' | 'failed', agoMs: number) => ({ status, fetchedAt: new Date(at - agoMs).toISOString() });
		expect(fresh(row('ok', 400 * 86_400_000), at)).toBe(true);
		expect(fresh(row('none', 29 * 86_400_000), at)).toBe(true);
		expect(fresh(row('none', 31 * 86_400_000), at)).toBe(false);
		expect(fresh(row('failed', 9 * 60_000), at)).toBe(true);
		expect(fresh(row('failed', 11 * 60_000), at)).toBe(false);
	});
});
