import { EQUIPMENT_TYPE_LABEL, equipmentName, isWithoutType } from '$lib/equipment';
import { bySpecies, livestockLabel, speciesCount } from '$lib/livestock';
import { getTank } from '$lib/server/tanks';
import { listEquipment, listLivestock, listPlants } from '$lib/server/specs';
import { tankDetails } from '$lib/server/tank-details';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const eq = listEquipment(user.id, t.id);
	const ls = bySpecies(listLivestock(user.id, t.id));
	const pl = listPlants(user.id, t.id);
	return {
		// specs, the pinned note, recent notes and routines (shared with Setup › Details)
		...tankDetails(user, t),
		equipment: eq.map((e) => ({ id: e.id, type: EQUIPMENT_TYPE_LABEL[e.type], name: equipmentName(e) })),
		// what it goes without on purpose: "Heater · None"
		without: t.withoutEquipment.filter(isWithoutType).map((w) => EQUIPMENT_TYPE_LABEL[w]),
		livestock: ls.map((l) => ({ id: l.id, name: livestockLabel(l), count: l.count, quarantine: l.status === 'quarantine' })),
		animals: ls.reduce((n, l) => n + l.count, 0),
		species: speciesCount(ls),
		plants: pl.map((p) => p.name)
	};
};
