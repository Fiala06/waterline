import { fail, redirect } from '@sveltejs/kit';
import { dateInZone, fmtDate } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { createEvent } from '$lib/server/logs';
import { photoFiles, preparePhotos, storePhotos, tankPhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null, months: [] };
	const tank = getTank(user.id, currentTankId);
	const months: { key: string; label: string; photos: { id: string; day: string }[] }[] = [];
	for (const { photo } of tankPhotos(user.id, tank.id)) {
		const date = dateInZone(photo.takenAt, user.timeZone);
		const key = date.slice(0, 7);
		let m = months.at(-1);
		if (!m || m.key !== key) {
			m = {
				key,
				label: new Date(key + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
				photos: []
			};
			months.push(m);
		}
		m.photos.push({ id: photo.id, day: fmtDate(date) });
	}
	return { tank: { id: tank.id, name: tank.name }, months };
};

export const actions: Actions = {
	// Photos uploaded straight to the gallery become a note entry.
	upload: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const tank = getTank(user.id, String(form.get('tankId') ?? ''));
		const files = photoFiles(form);
		if (!files.length) return fail(400, { error: 'Choose at least one photo.' });
		const prepared = await preparePhotos(files);
		if ('error' in prepared) return fail(400, { error: prepared.error });
		const at = new Date().toISOString();
		const { event } = createEvent(user.id, tank.id, { category: 'note', occurredAt: at, note: null, data: {} }, { timeZone: user.timeZone });
		storePhotos(tank.id, prepared, { eventId: event.id, takenAt: at });
		setFlash(cookies, `✓ ${files.length} photo${files.length === 1 ? '' : 's'} added`);
		redirect(303, '/photos');
	}
};
