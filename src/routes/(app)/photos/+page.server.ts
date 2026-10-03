import { fail, redirect } from '@sveltejs/kit';
import { dateInZone, fmtDate, isDate, todayInZone, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { createEvent } from '$lib/server/logs';
import { datePhotos, photoDate, photoFiles, photoHints, preparePhotos, storePhotos, tankPhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const today = todayInZone(user.timeZone);
	if (!currentTankId) return { tank: null, months: [], today };
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
	return { tank: { id: tank.id, name: tank.name }, months, today };
};

export const actions: Actions = {
	// Photos uploaded straight to the gallery become a note entry, one per day they were
	// taken (#42): each photo keeps the date in its details; the rest take the Taken date.
	upload: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const tank = getTank(user.id, String(form.get('tankId') ?? ''), 'log');
		const files = photoFiles(form);
		if (!files.length) return fail(400, { error: 'Choose at least one photo.' });
		const today = todayInZone(user.timeZone);
		const taken = str(form, 'taken') || today;
		if (!isDate(taken) || taken > today) return fail(400, { error: 'Pick a day up to today for Taken.' });
		// today: this moment; an earlier day: midday, since the photo doesn't say
		const fallback = taken === today ? new Date().toISOString() : zonedToUtc(taken, '12:00', user.timeZone).toISOString();
		const prepared = await preparePhotos(files, photoHints(form));
		if ('error' in prepared) return fail(400, { error: prepared.error });
		// photos that don't say when they were taken get the Taken date: the toast says so
		const undated = prepared.filter((p) => !photoDate(p, user.timeZone)).length;
		datePhotos(prepared, user.timeZone, fallback);
		const days = new Map<string, typeof prepared>();
		for (const p of prepared) {
			const day = dateInZone(p.takenAt!, user.timeZone);
			days.set(day, [...(days.get(day) ?? []), p]);
		}
		for (const group of days.values()) {
			const at = group.map((p) => p.takenAt!).sort()[0];
			const { event } = createEvent(user.id, tank.id, { category: 'note', occurredAt: at, note: null, data: {} }, { timeZone: user.timeZone });
			storePhotos(tank.id, group, { eventId: event.id, takenAt: at });
		}
		const n = files.length;
		const dated = undated === n ? ` · dated ${taken === today ? 'today' : fmtDate(taken)}` : '';
		setFlash(cookies, `✓ ${n} photo${n === 1 ? '' : 's'} added${days.size > 1 ? ` on ${days.size} days` : dated}`);
		redirect(303, '/photos');
	}
};
