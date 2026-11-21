// Settings › Data › Delete account (#303): what goes and what stays, a
// backup first, then the keeper's own say-so: signed in within the last few
// minutes, and their email address typed out. Never the server's last admin.
import { fail, redirect } from '@sveltejs/kit';
import { accountFootprint, adminCount, deleteOwnAccount } from '$lib/server/people';
import { str } from '$lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

/** How recently they must have signed in to delete the account. */
const RECENT_SIGN_IN_MIN = 15;

async function signedInRecently(locals: App.Locals) {
	const at = ((await locals.auth())?.user as { signedInAt?: number } | undefined)?.signedInAt ?? 0;
	return Date.now() - at * 1000 < RECENT_SIGN_IN_MIN * 60_000;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	return {
		footprint: accountFootprint(user.id),
		lastAdmin: user.isAdmin && adminCount() <= 1,
		recent: await signedInRecently(locals),
		minutes: RECENT_SIGN_IN_MIN
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const typed = str(await request.formData(), 'email');
		if (!(await signedInRecently(locals))) return fail(400, { error: `Sign in again first: deleting your account needs a sign-in from the last ${RECENT_SIGN_IN_MIN} minutes.`, typed });
		if (typed.trim().toLowerCase() !== user.email.toLowerCase()) return fail(400, { error: 'Type your email address exactly as it is shown.', typed });
		await deleteOwnAccount(user);
		// signed out here: the session's cookie goes with the account
		for (const c of cookies.getAll()) if (c.name.includes('authjs.session-token')) cookies.delete(c.name, { path: '/' });
		redirect(303, '/signin?deleted=1');
	}
};
