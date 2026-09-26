import { error, fail, redirect } from '@sveltejs/kit';
import { fmtTime, fmtWhen, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, parseWhen } from '$lib/server/forms';
import { eventFormContext, eventFormValues, parseEventData } from '$lib/server/log-forms';
import { getEvent, updateEvent } from '$lib/server/logs';
import { deleteEntryPhotos, entryPhotos, photoFiles, preparePhotos, storePhotos } from '$lib/server/photos';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const e = getEvent(user.id, params.id);
	if (e.category === 'note' && e.data.system) error(400, "This entry can't be edited");
	const tank = getTank(user.id, e.tankId);
	return {
		entry: { id: e.id, tankName: tank.name, category: e.category, note: e.note ?? '' },
		context: eventFormContext(tank, user),
		values: eventFormValues(e.category, e.data, user),
		when: utcToZoned(e.occurredAt, user.timeZone),
		photos: entryPhotos({ eventId: e.id }).map((p) => ({ id: p.id })),
		meta: `Logged ${fmtWhen(e.occurredAt, user.timeZone)}${e.editedAt ? ` · edited ${fmtTime(e.editedAt, user.timeZone)}` : ''}`
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const e = getEvent(user.id, params.id);
		const tank = getTank(user.id, e.tankId);
		const form = await request.formData();
		const values: Record<string, string | string[]> = {};
		for (const k of new Set(form.keys())) {
			const all = form.getAll(k).map(String);
			values[k] = ['actions', 'tags', 'reasons'].includes(k) ? all : all[0];
		}
		const files = photoFiles(form);
		const { data, errors } = parseEventData(e.category, form, tank, user);
		const keeping = entryPhotos({ eventId: e.id }).length - form.getAll('removePhoto').length;
		if (files.length || keeping > 0) {
			delete errors.note;
			delete errors.tags;
			delete errors.actions;
		}
		if (Object.keys(errors).length) return fail(400, { errors, values, error: null });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors, values, error: when.error });
		const prepared = await preparePhotos(files);
		if ('error' in prepared) return fail(400, { errors, values, error: prepared.error });
		// keep fields the form doesn't edit (e.g. recheck_at)
		updateEvent(user.id, e.id, { occurredAt: when.at, note: optStr(form, 'note'), data: { ...e.data, ...data } });
		deleteEntryPhotos(user.id, form.getAll('removePhoto').map(String), { eventId: e.id });
		storePhotos(e.tankId, prepared, { eventId: e.id, takenAt: when.at });
		setFlash(cookies, '✓ Changes saved');
		redirect(303, `/entries/event/${e.id}`);
	}
};
