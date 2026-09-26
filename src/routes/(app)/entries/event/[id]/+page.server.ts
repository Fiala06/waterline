import { redirect } from '@sveltejs/kit';
import { eventView } from '$lib/server/entry-view';
import { setFlash } from '$lib/server/flash';
import { safeReturn } from '$lib/server/redirect';
import { deleteEvent } from '$lib/server/logs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({ entry: eventView(locals.user!, params.id) });

export const actions: Actions = {
	delete: async ({ request, locals, params, cookies }) => {
		const from = (await request.formData()).get('from');
		const e = deleteEvent(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, safeReturn(from, `/?tank=${e.tankId}`));
	}
};
