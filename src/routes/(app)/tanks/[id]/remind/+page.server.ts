import { fail, redirect } from '@sveltejs/kit';
import { reminderDue } from '$lib/tasks';
import { fmtDate, todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { safeReturn } from '$lib/server/redirect';
import { getTank } from '$lib/server/tanks';
import { createTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

// "Remind me about this tank": a one-off task, from the tank's page or the
// dashboard (in a sheet), or this page without scripts.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	return {
		tank: { id: tank.id, name: tank.name },
		today: todayInZone(user.timeZone),
		from: safeReturn(url.searchParams.get('from'), `/tanks/${tank.id}`)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id);
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 80);
		const values = { name, when: str(form, 'when'), date: str(form, 'date') };
		if (!name) return fail(400, { error: 'Say what to be reminded about.', values });
		const due = reminderDue(values.when, values.date, todayInZone(user.timeZone));
		if (!due) return fail(400, { error: values.when === 'date' ? 'Choose a day after today.' : 'Choose when.', values });
		createTask(user.id, tank.id, {
			name,
			kind: 'other',
			recurring: false,
			intervalDays: null,
			scheduleMode: 'completion',
			nextDue: due,
			openFormOnDone: false
		});
		setFlash(cookies, `✓ Reminder set for ${fmtDate(due)}`);
		redirect(303, safeReturn(form.get('from'), `/tanks/${tank.id}`));
	}
};
