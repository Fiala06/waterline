import { normalizeBarcode } from '$lib/barcode';
import { brandAndModel, DEFAULT_SERVICE, guessEquipmentType } from '$lib/equipment';
import { cachedBarcode } from '$lib/server/barcode-lookup';
import { equipmentFormValues, saveEquipmentAction } from '$lib/server/equipment-form';
import { doseProducts } from '$lib/server/equipment-form';
import { knownBrands } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import { todayInZone } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'owner');
	const values = equipmentFormValues(null, user);
	// from the scanner (#147): the barcode stays with the item, and what the lookup found starts the form
	const code = normalizeBarcode(url.searchParams.get('barcode'));
	let scanned: { code: string; title: string | null; source: string | null } | null = null;
	if (code) {
		values.barcode = code;
		const found = cachedBarcode(code);
		if (found?.status === 'ok' && found.title) {
			const { brand, model } = brandAndModel(found.title, found.brand);
			values.brand = brand;
			values.model = model;
			values.type = guessEquipmentType(`${found.category ?? ''} ${found.title}`);
			values.serviceEvery = DEFAULT_SERVICE[values.type] ?? 'off';
			scanned = { code, title: found.title, source: found.source };
		} else scanned = { code, title: null, source: null };
	}
	return { tankId: tank.id, values, scanned, brands: knownBrands(user.id), products: doseProducts(user.id, tank.id), today: todayInZone(user.timeZone) };
};

export const actions: Actions = { save: (e) => saveEquipmentAction(e, e.params.id, null) };
