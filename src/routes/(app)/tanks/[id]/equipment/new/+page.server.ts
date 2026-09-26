import { equipmentFormValues, saveEquipmentAction } from '$lib/server/equipment-form';
import { knownBrands } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const tank = getTank(locals.user!.id, params.id);
	return { tankId: tank.id, values: equipmentFormValues(null, locals.user!), brands: knownBrands(locals.user!.id) };
};

export const actions: Actions = { save: (e) => saveEquipmentAction(e, e.params.id, null) };
