import { fail, redirect } from '@sveltejs/kit';
import { ALGAE_SEVERITY, ALGAE_TYPES } from '$lib/plants';
import { todayInZone, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { parseWhen, str } from '$lib/server/forms';
import { logAlgae } from '$lib/server/log-plants';
import { photoFiles, photoHints, preparePhotos, storePhotos } from '$lib/server/photos';
import { safeReturn } from '$lib/server/redirect';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// Log algae (#86): which kind, how much, where, a note and photos. An observation
// event tagged Algae, in History, and a mark on Charts when its overlay is on.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	return {
		tank: { id: tank.id, name: tank.name },
		types: ALGAE_TYPES,
		severities: ALGAE_SEVERITY,
		today: todayInZone(user.timeZone),
		now: utcToZoned(new Date(), user.timeZone),
		from: safeReturn(url.searchParams.get('from'), `/?tank=${tank.id}`)
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const values = { algae: str(form, 'algae'), severity: str(form, 'severity'), area: str(form, 'area'), note: str(form, 'note'), date: str(form, 'date'), time: str(form, 'time') };
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors: { when: when.error } as Record<string, string>, values });
		const prepared = await preparePhotos(photoFiles(form), photoHints(form));
		if ('error' in prepared) return fail(400, { errors: { photos: prepared.error } as Record<string, string>, values });
		const r = logAlgae(user, tank, form, when.at);
		if ('errors' in r) return fail(400, { errors: r.errors, values });
		await storePhotos(tank.id, prepared, { eventId: r.eventId, takenAt: when.at });
		setFlash(cookies, '✓ Algae logged', { view: `/entries/event/${r.eventId}` });
		redirect(303, safeReturn(form.get('from'), `/?tank=${tank.id}`));
	}
};
