import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): Open Products Facts and UPCitemdb as
// the barcode lookup (#147) reads them, for the end-to-end tests
// (BARCODE_OPF_URL and BARCODE_UPCITEMDB_URL point here). One product is in
// Open Products Facts, two only in UPCitemdb, one makes UPCitemdb answer that
// the day's lookups are used up, and anything else is in neither.
const OPF: Record<string, { product_name: string; brands: string; categories: string }> = {
	'0000116043601': { product_name: 'Prime', brands: 'Seachem', categories: 'Water conditioners' }
};
const UPC: Record<string, { title: string; brand: string; category: string }> = {
	'0015561104470': { title: 'Fluval 407 Performance Canister Filter, Aquarium Filter for up to 100 Gallons', brand: 'FLUVAL', category: 'Pet Supplies > Fish Supplies > Aquarium Filters' },
	'96385074': { title: 'Tidewell 200 W Submersible Aquarium Heater with Thermostat', brand: 'Tidewell', category: 'Pet Supplies > Fish Supplies > Aquarium Heaters' }
};
const USED_UP = '0012345678905';

export const GET: RequestHandler = ({ params, url }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const path = params.path;
	const opf = /^opf\/api\/v2\/product\/(\d+)\.json$/.exec(path);
	if (opf) {
		const p = OPF[opf[1]];
		return p ? json({ status: 1, product: p }) : json({ status: 0, status_verbose: 'product not found' }, { status: 404 });
	}
	if (path === 'upcitemdb/prod/trial/lookup') {
		const code = url.searchParams.get('upc') ?? '';
		if (code === USED_UP) return json({ code: 'EXCEED_LIMIT', message: 'Exceed request limit' }, { status: 429 });
		const item = UPC[code];
		return json(item ? { code: 'OK', total: 1, items: [item] } : { code: 'OK', total: 0, items: [] });
	}
	error(404, 'Not found');
};
