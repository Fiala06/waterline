import { redirect } from '@sveltejs/kit';
import { testView } from '$lib/server/entry-view';
import { setFlash } from '$lib/server/flash';
import { safeReturn } from '$lib/server/redirect';
import { deleteTest, getTest, latestTest } from '$lib/server/logs';
import { tankSuggestions } from '$lib/server/suggestions';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const entry = testView(user, params.id);
	// the steps its readings suggest (#179): only for the tank's latest test, while they still apply
	const { test, readings } = getTest(user.id, params.id);
	const suggestions = latestTest(test.tankId)?.id === test.id ? tankSuggestions(user, getTank(user.id, test.tankId), readings) : [];
	return { entry, suggestions };
};

export const actions: Actions = {
	delete: async ({ request, locals, params, cookies }) => {
		const from = (await request.formData()).get('from');
		const test = deleteTest(locals.user!.id, params.id);
		setFlash(cookies, 'Entry deleted');
		redirect(303, safeReturn(from, `/?tank=${test.tankId}`));
	}
};
