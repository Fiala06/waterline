import { error } from '@sveltejs/kit';
import { equipmentFormValues, removeEquipmentAction, saveEquipmentAction } from '$lib/server/equipment-form';
import { getEquipment, knownBrands } from '$lib/server/specs';
import { todayInZone } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const e = getEquipment(locals.user!.id, params.eid);
	if (e.tankId !== params.id) error(404, 'Equipment not found');
	return { tankId: e.tankId, values: equipmentFormValues(e, locals.user!), brands: knownBrands(locals.user!.id), today: todayInZone(locals.user!.timeZone) };
};

export const actions: Actions = {
	save: (e) => saveEquipmentAction(e, e.params.id, e.params.eid),
	remove: (e) => removeEquipmentAction(e, e.params.eid)
};
