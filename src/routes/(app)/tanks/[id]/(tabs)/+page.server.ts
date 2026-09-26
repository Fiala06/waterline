import { EQUIPMENT_TYPE_LABEL, equipmentName } from '$lib/equipment';
import { getTank } from '$lib/server/tanks';
import { listEquipment, listLivestock, listPlants } from '$lib/server/specs';
import type { PageServerLoad } from './$types';

const SOURCES: Record<string, string> = { tap: 'Tap', rodi: 'RODI', mix: 'Mix', well: 'Well' };

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const eq = listEquipment(user.id, t.id);
	const ls = listLivestock(user.id, t.id);
	const pl = listPlants(user.id, t.id);
	return {
		specs: [
			['Tank', [t.specBrand, t.specModel].filter(Boolean).join(' ')],
			['Glass', t.glass],
			['Substrate', t.substrate],
			['Water source', t.waterSource ? SOURCES[t.waterSource] : null],
			['Photoperiod', t.photoperiodH != null ? `${t.photoperiodH} h` : null]
		].filter(([, v]) => v) as [string, string][],
		notes: t.notes,
		equipment: eq.map((e) => ({ id: e.id, type: EQUIPMENT_TYPE_LABEL[e.type], name: equipmentName(e) })),
		livestock: ls.map((l) => ({ id: l.id, name: l.commonName, count: l.count, quarantine: l.status === 'quarantine' })),
		animals: ls.reduce((n, l) => n + l.count, 0),
		plants: pl.map((p) => p.name)
	};
};
