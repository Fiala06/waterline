import { redirect } from '@sveltejs/kit';
import { testView } from '$lib/server/entry-view';
import { setFlash } from '$lib/server/flash';
import { deleteTest } from '$lib/server/logs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({ entry: testView(locals.user!, params.id) });

export const actions: Actions = {
	delete: ({ locals, params, cookies }) => {
		const test = deleteTest(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, `/?tank=${test.tankId}`);
	}
};
