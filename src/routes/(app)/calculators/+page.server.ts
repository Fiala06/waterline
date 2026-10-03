// Calculators (#18): tank volume, water change, dose → ppm, heater size,
// substrate, CO₂ from pH and KH, and GH / KH remineralization, filled in from
// what the app already knows about the tank: its size and volumes, the latest
// readings and targets, and saved products with a strength.
import { fail, redirect } from '@sveltejs/kit';
import { tankVolume } from '$lib/calculators';
import { paramUnit } from '$lib/params';
import { fmtVolume } from '$lib/calculators-format';
import { setFlash } from '$lib/server/flash';
import { num, str } from '$lib/server/forms';
import { createEvent, latestReadings } from '$lib/server/logs';
import { listProducts } from '$lib/server/products';
import { getTank, listParams, listTanks, updateTank } from '$lib/server/tanks';
import { formatNumber, toDisplay, toStored, unitLabel } from '$lib/units';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const tanks = listTanks(user.id).map((t) => ({ id: t.id, name: t.name }));
	const tank = currentTankId ? getTank(user.id, currentTankId) : null;
	const disp = (v: number | null, q: 'volume' | 'length' | 'temp', d = 1) => (v == null ? '' : formatNumber(toDisplay(v, q, user), d));
	const latest = tank ? latestReadings(tank.id) : new Map<string, { value: number; takenAt: string }>();
	// every parameter with a reading or a target, in the keeper's units, for the water change's pick list
	const params = tank
		? listParams(tank.id, { all: true })
			.filter((p) => latest.has(p.id) || p.max != null)
			.map((p) => {
				const r = latest.get(p.id);
				const show = (v: number | null) => (v == null ? '' : formatNumber(toDisplay(v, p.key === 'gh' || p.key === 'kh' ? 'hardness' : p.key === 'temp' ? 'temp' : 'none', user), 2));
				return { id: p.id, key: p.key, name: p.name, unit: paramUnit(p, user), value: show(r?.value ?? null), min: show(p.min), max: show(p.max) };
			})
		: [];
	const by = (key: string) => params.find((p) => p.key === key) ?? null;
	return {
		tanks,
		tank: tank
			? {
					id: tank.id,
					name: tank.name,
					type: tank.type,
					length: disp(tank.lengthCm, 'length'),
					width: disp(tank.widthCm, 'length'),
					height: disp(tank.heightCm, 'length'),
					nominalVolume: disp(tank.nominalVolumeL, 'volume'),
					actualVolume: disp(tank.actualVolumeL, 'volume'),
					hasSize: tank.lengthCm != null && tank.widthCm != null && tank.heightCm != null
				}
			: null,
		units: { vol: unitLabel('volume', user), len: unitLabel('length', user), temp: unitLabel('temp', user), gh: unitLabel('hardness', user, 'gh'), kh: unitLabel('hardness', user, 'kh') },
		imperial: user.unitSystem === 'imperial',
		hardnessPpm: user.hardnessUnit === 'ppm',
		params,
		readings: { no3: by('no3'), ph: by('ph'), kh: by('kh'), gh: by('gh'), temp: by('temp') },
		products: listProducts(user.id)
			.filter((p) => p.strengthMgPerMl != null)
			.map((p) => ({ id: p.id, name: p.name, mgPerMl: p.strengthMgPerMl!, of: p.strengthOf }))
	};
};

export const actions: Actions = {
	/** "Save as the tank's water volume": the volume worked out from the size, kept with the size when the tank had none. */
	saveVolume: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const tank = getTank(user.id, str(form, 'tankId'));
		const len = (k: string) => {
			const v = num(form, k);
			return v == null ? null : toStored(v, 'length', user);
		};
		const [lengthCm, widthCm, heightCm] = [len('length'), len('width'), len('height')];
		if (lengthCm == null || widthCm == null || heightCm == null) return fail(400, { error: 'Enter the length, width and height.' });
		const v = tankVolume({ lengthCm, widthCm, heightCm, glassCm: len('glass') ?? 0, substrateCm: len('substrate') ?? 0, gapCm: len('gap') ?? 0 });
		if (!v || v.waterL <= 0) return fail(400, { error: 'That size leaves no room for water.' });
		const sizeMissing = tank.lengthCm == null && tank.widthCm == null && tank.heightCm == null;
		updateTank(user.id, tank.id, { actualVolumeL: v.waterL, ...(sizeMissing ? { lengthCm, widthCm, heightCm } : {}) });
		createEvent(user.id, tank.id, { category: 'note', occurredAt: new Date().toISOString(), note: null, data: { system: 'volume_set', volumeL: v.waterL } }, { timeZone: user.timeZone });
		setFlash(cookies, `✓ Water volume saved · ${fmtVolume(v.waterL, user)}`, { view: `/tanks/${tank.id}/settings` });
		redirect(303, `/calculators?tank=${tank.id}#volume`);
	}
};
