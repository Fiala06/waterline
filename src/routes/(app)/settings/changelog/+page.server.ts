import { redirect } from '@sveltejs/kit';
import { VERSION } from '$lib/changelog';
import { safeReturn } from '$lib/server/redirect';
import { updateUser } from '$lib/server/users';
import type { Actions } from './$types';

export const actions: Actions = {
	/** The dashboard's What's new card: this version has been seen. Then back, or on to this page. */
	seen: async ({ request, locals }) => {
		const form = await request.formData();
		updateUser(locals.user!.id, { seenVersion: VERSION });
		redirect(303, safeReturn(form.get('to'), '/'));
	}
};
