import { redirect } from '@sveltejs/kit';
import { eventView } from '$lib/server/entry-view';
import { setFlash } from '$lib/server/flash';
import { deleteEvent } from '$lib/server/logs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({ entry: eventView(locals.user!, params.id) });

export const actions: Actions = {
	delete: ({ locals, params, cookies }) => {
		const e = deleteEvent(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, `/?tank=${e.tankId}`);
	}
};
