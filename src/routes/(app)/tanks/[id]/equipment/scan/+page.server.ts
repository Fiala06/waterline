import { fail, redirect } from '@sveltejs/kit';
import { normalizeBarcode } from '$lib/barcode';
import { brandAndModel, EQUIPMENT_TYPE_LABEL, guessEquipmentType } from '$lib/equipment';
import { decodeBarcodeImage } from '$lib/server/barcode-decode';
import { barcodeLookupOn, equipmentWithBarcode, lookupBarcode, needsFetch } from '$lib/server/barcode-lookup';
import { logger } from '$lib/server/log';
import { allowRate } from '$lib/server/rate-limit';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// Scan a barcode to add equipment (#147). The page reads the barcode (the
// camera in the browser, a photo read here, or the number typed) and comes
// back to ?code=…, where the result is: the keeper's item that has it already,
// what the product databases say it is (Add to tank opens the form filled
// in), nothing found, or why the lookup couldn't be made.

/** a photo of a barcode needn't be large, but phones send what they have */
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** barcodes that ask the databases, per person and hour: UPCitemdb allows the server 100 a day */
const LOOKUPS_AN_HOUR = 30;

export type ScanResult =
	| { status: 'invalid' }
	| { status: 'existing'; code: string; items: { id: string; tankId: string; tankName: string; name: string; here: boolean }[] }
	| { status: 'found'; code: string; title: string; brand: string; model: string; type: string; source: string }
	| { status: 'none' | 'off' | 'failed'; code: string; reason: string };

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const raw = url.searchParams.get('code');
	// one address per barcode: a number typed as the 12 digits of a UPC-A lands on its EAN-13
	const code = raw == null ? null : normalizeBarcode(raw);
	if (code && code !== raw) redirect(303, `${url.pathname}?code=${code}`);
	const result = raw == null ? null : await scanResult(user.id, tank.id, raw);
	return { tankId: tank.id, raw: raw ?? '', admin: user.isAdmin, result };
};

async function scanResult(userId: string, tankId: string, raw: string): Promise<ScanResult> {
	const code = normalizeBarcode(raw);
	if (!code) return { status: 'invalid' };
	const items = equipmentWithBarcode(userId, code);
	if (items.length) return { status: 'existing', code, items: items.map((i) => ({ ...i, here: i.tankId === tankId })) };
	if (!barcodeLookupOn()) return { status: 'off', code, reason: 'Barcode lookup is off on this server' };
	if (needsFetch(code) && !allowRate(`barcode:${userId}`, LOOKUPS_AN_HOUR)) {
		return { status: 'failed', code, reason: `More than ${LOOKUPS_AN_HOUR} new barcodes in an hour; try again later` };
	}
	const found = await lookupBarcode(code);
	if (found.status === 'ok') {
		const { brand, model } = brandAndModel(found.title, found.brand);
		const type = guessEquipmentType(`${found.category ?? ''} ${found.title}`);
		return { status: 'found', code, title: found.title, brand, model, type: EQUIPMENT_TYPE_LABEL[type], source: found.source };
	}
	if (found.status === 'failed') logger.warn('barcodes', `Couldn't look barcode ${code} up: ${found.reason}`, { userId });
	return { status: found.status, code, reason: found.reason };
}

export const actions: Actions = {
	/** A photo of the barcode, read here: for a page without scripts, or a camera that can't open. */
	photo: async ({ request, locals, params, url }) => {
		const user = locals.user!;
		getTank(user.id, params.id, 'owner');
		const form = await request.formData();
		const file = form.get('photo');
		if (!(file instanceof File) || !file.size) return fail(400, { photoError: 'Choose a photo of the barcode.' });
		if (file.size > MAX_PHOTO_BYTES) return fail(400, { photoError: 'That photo is over 20 MB.' });
		let found: Awaited<ReturnType<typeof decodeBarcodeImage>>;
		try {
			found = await decodeBarcodeImage(Buffer.from(await file.arrayBuffer()));
		} catch (e) {
			logger.info('barcodes', "A photo couldn't be read for a barcode", { userId: user.id, error: e });
			return fail(400, { photoError: "That file couldn't be read as a photo. Try a JPEG or PNG." });
		}
		if (!found) return fail(400, { photoError: 'No barcode found in that photo. Fill the frame with the barcode, in good light, and try again.' });
		redirect(303, `${url.pathname}?code=${found.code}`);
	}
};
