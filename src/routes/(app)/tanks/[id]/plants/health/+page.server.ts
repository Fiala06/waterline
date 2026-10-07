import { fail, redirect } from '@sveltejs/kit';
import { PLANT_OBSERVATIONS } from '$lib/plants';
import { todayInZone, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { parseWhen, str } from '$lib/server/forms';
import { logPlantHealth, plantHealthValues } from '$lib/server/log-plants';
import { photoFiles, photoHints, preparePhotos, storePhotos } from '$lib/server/photos';
import { safeReturn } from '$lib/server/redirect';
import { listPlants } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// Log plant health (#85): which plants, what they're doing, a note and photos.
// An observation event, in History and in each plant's sheet; the plant's status follows.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	return {
		tank: { id: tank.id, name: tank.name },
		plants: listPlants(user.id, tank.id).map((p) => ({ id: p.id, name: p.name })),
		// opened from a plant's sheet: that one is ticked
		preselect: url.searchParams.get('plant'),
		observations: PLANT_OBSERVATIONS,
		today: todayInZone(user.timeZone),
		now: utcToZoned(new Date(), user.timeZone),
		from: safeReturn(url.searchParams.get('from'), `/tanks/${tank.id}/plants`)
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const values = { ...plantHealthValues(form), date: str(form, 'date'), time: str(form, 'time') };
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors: { when: when.error } as Record<string, string>, values });
		const prepared = await preparePhotos(photoFiles(form), photoHints(form));
		if ('error' in prepared) return fail(400, { errors: { photos: prepared.error } as Record<string, string>, values });
		const r = logPlantHealth(user, tank, form, when.at);
		if ('errors' in r) return fail(400, { errors: r.errors, values });
		await storePhotos(tank.id, prepared, { eventId: r.eventId, takenAt: when.at });
		setFlash(cookies, `✓ Plant health logged · ${r.names.length > 2 ? `${r.names.length} plants` : r.names.join(', ')}`, { view: `/entries/event/${r.eventId}` });
		redirect(303, safeReturn(form.get('from'), `/tanks/${tank.id}/plants`));
	}
};
