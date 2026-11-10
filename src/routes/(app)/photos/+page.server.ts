import { fail, redirect } from '@sveltejs/kit';
import { dateInZone, fmtDate, isDate, todayInZone, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { createEvent, deleteEvent } from '$lib/server/logs';
import { datePhotos, photoDate, photoFiles, photoHints, preparePhotos, storePhotos, tankPhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import { readSort } from '$lib/sort';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const today = todayInZone(user.timeZone);
	// newest first, or oldest first from Sort by (#79); still grouped by month
	const sort = readSort(url, ['date'] as const);
	if (!currentTankId) return { tank: null, months: [], today, sort };
	const tank = getTank(user.id, currentTankId);
	const months: { key: string; label: string; photos: { id: string; day: string }[] }[] = [];
	const list = tankPhotos(user.id, tank.id);
	if (sort?.dir === 'asc') list.reverse();
	for (const { photo } of list) {
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
	return { tank: { id: tank.id, name: tank.name }, months, today, sort };
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
		// all the days or none: if a day's photos can't be stored, the notes made so far go too,
		// so History has no empty note and trying again doesn't repeat the days that did save
		const made: string[] = [];
		try {
			for (const group of days.values()) {
				const at = group.map((p) => p.takenAt!).sort()[0];
				const { event, duplicate } = createEvent(user.id, tank.id, { category: 'note', occurredAt: at, note: null, data: {} }, { timeZone: user.timeZone });
				if (!duplicate) made.push(event.id);
				await storePhotos(tank.id, group, { eventId: event.id, takenAt: at });
			}
		} catch (err) {
			for (const id of made) deleteEvent(user.id, id);
			logger.error('photos', "Photos couldn't be stored", { userId: user.id, tankId: tank.id, error: err });
			return fail(500, { error: "The photos couldn't be saved. Nothing was added: try again." });
		}
		const n = files.length;
		const dated = undated === n ? ` · dated ${taken === today ? 'today' : fmtDate(taken)}` : '';
		setFlash(cookies, `✓ ${n} photo${n === 1 ? '' : 's'} added${days.size > 1 ? ` on ${days.size} days` : dated}`);
		redirect(303, '/photos');
	}
};
