import { fail, redirect } from '@sveltejs/kit';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { setFlash } from '$lib/server/flash';
import { parseTankForm } from '$lib/server/forms';
import { preparePhotos, setCover, storePhotos } from '$lib/server/photos';
import { getTank, listParams, setArchived, updateTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const all = listParams(tank.id, { all: true });
	const tracked = all.filter((p) => p.tracked);
	const v = (x: number | null, q: 'volume' | 'length', d: number) =>
		x == null ? '' : formatNumber(toDisplay(x, q, user), d);
	return {
		tank: {
			id: tank.id,
			name: tank.name,
			type: tank.type,
			archived: !!tank.archivedAt,
			cover: tank.coverPhotoId,
			nominalVolume: v(tank.nominalVolumeL, 'volume', 1),
			actualVolume: v(tank.actualVolumeL, 'volume', 1),
			length: v(tank.lengthCm, 'length', 1),
			width: v(tank.widthCm, 'length', 1),
			height: v(tank.heightCm, 'length', 1),
			startDate: tank.startDate ?? '',
			notes: tank.notes ?? ''
		},
		paramSummary: {
			tracked: tracked.length,
			custom: all.filter((p) => p.isCustom).length,
			names: tracked.map((p) => p.name).join(', ')
		},
		volUnit: unitLabel('volume', user),
		lenUnit: unitLabel('length', user)
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const { errors, values } = parseTankForm(form, user);
		if (Object.keys(errors).length) return fail(400, { errors });
		const cover = form.get('cover');
		const prepared = cover instanceof File && cover.size ? await preparePhotos([cover]) : [];
		if ('error' in prepared) return fail(400, { errors: { cover: prepared.error } });
		updateTank(user.id, params.id, values);
		const [photo] = storePhotos(params.id, prepared, { takenAt: new Date().toISOString() });
		if (photo) setCover(user.id, photo.id);
		setFlash(cookies, '✓ Tank saved');
		redirect(303, `/?tank=${params.id}`);
	},
	archive: async ({ locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id);
		setArchived(locals.user!.id, params.id, true);
		cookies.delete('wl_tank', { path: '/' });
		setFlash(cookies, `${tank.name} archived`);
		redirect(303, '/tanks');
	}
};
