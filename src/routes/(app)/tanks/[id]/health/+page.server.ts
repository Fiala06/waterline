import { fail, redirect } from '@sveltejs/kit';
import { bySpecies, HEALTH_OUTCOMES, HEALTH_SYMPTOMS, livestockLabel } from '$lib/livestock';
import { todayInZone, utcToZoned } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { parseWhen, str } from '$lib/server/forms';
import { healthValues, logHealth } from '$lib/server/log-livestock';
import { safeReturn } from '$lib/server/redirect';
import { listLivestock } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import { courseHref } from '$lib/server/task-form';
import type { Actions, PageServerLoad } from './$types';

// Log health: which animals, what was seen, what's being done and how it
// stands. An event with category 'health', in History and on each animal's page.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	const now = utcToZoned(new Date(), user.timeZone);
	return {
		tank: { id: tank.id, name: tank.name },
		livestock: bySpecies(listLivestock(user.id, tank.id)).map((l) => ({ id: l.id, label: livestockLabel(l), count: l.count })),
		// opened from an animal's page: that one is ticked
		preselect: url.searchParams.get('livestock'),
		symptoms: HEALTH_SYMPTOMS,
		outcomes: HEALTH_OUTCOMES,
		today: todayInZone(user.timeZone),
		now,
		from: safeReturn(url.searchParams.get('from'), `/tanks/${tank.id}/livestock`)
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const values = { ...healthValues(form), date: str(form, 'date'), time: str(form, 'time') };
		const when = parseWhen(form, user.timeZone);
		if ('error' in when) return fail(400, { errors: { when: when.error } as Record<string, string>, values });
		const r = logHealth(user, tank, form, when.at);
		if ('errors' in r) return fail(400, { errors: r.errors, values });
		const from = safeReturn(form.get('from'), `/tanks/${tank.id}/livestock`);
		setFlash(cookies, '✓ Health logged');
		// "Save and start a treatment course": the new-routine form, filled in with the treatment
		if (str(form, 'then') === 'course') redirect(303, courseHref(tank.id, r.treatment, todayInZone(user.timeZone), from));
		redirect(303, from);
	}
};
