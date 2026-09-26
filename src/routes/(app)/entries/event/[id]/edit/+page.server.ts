import { error, fail, redirect } from '@sveltejs/kit';
import { fmtTime, fmtWhen, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, parseWhen } from '$lib/server/forms';
import { eventFormContext, eventFormValues, parseEventData } from '$lib/server/log-forms';
import { getEvent, updateEvent } from '$lib/server/logs';
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
		const { data, errors } = parseEventData(e.category, form, tank, user);
		if (Object.keys(errors).length) return fail(400, { errors, values, error: null });
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors, values, error: when.error });
		// keep fields the form doesn't edit (e.g. recheck_at)
		updateEvent(user.id, e.id, { occurredAt: when.at, note: optStr(form, 'note'), data: { ...e.data, ...data } });
		setFlash(cookies, '✓ Changes saved');
		redirect(303, `/entries/event/${e.id}`);
	}
};
