import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { signInWith } from '../../auth';
import { str } from '$lib/server/forms';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { codeMatches, finishSetup, setupCode, setupNeeded } from '$lib/server/setup';
import type { Actions, PageServerLoad } from './$types';

// A new server's first page: the setup code from the log, then the admin login.
export const load: PageServerLoad = () => {
	if (!setupNeeded()) redirect(303, '/signin');
	setupCode(); // printed to the log, if it wasn't already
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		if (!setupNeeded()) redirect(303, '/signin');
		const address = event.getClientAddress();
		const form = await event.request.formData();
		const username = str(form, 'username') || 'admin';
		const values = { username, code: '' };
		const wait = loginBlockedMinutes(address);
		if (wait) return fail(429, { values, errors: { code: `Too many tries. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` } });
		if (!codeMatches(str(form, 'code'))) {
			recordLoginFailure(address);
			return fail(400, { values, errors: { code: "That isn't the setup code. Copy it from the server's log." } });
		}
		const password = String(form.get('password') ?? '');
		const errors: Record<string, string> = {};
		if (!/^[\w.@-]{1,40}$/.test(username)) errors.username = 'Use letters, numbers, dots, dashes or underscores.';
		if (password.length < 8) errors.password = 'Use at least 8 characters.';
		else if (password.length > 1024) errors.password = 'Use at most 1024 characters.';
		else if (password !== String(form.get('confirm') ?? '')) errors.confirm = "The passwords don't match.";
		// the right code stays in the form while the rest is fixed
		if (Object.keys(errors).length) return fail(400, { values: { ...values, code: str(form, 'code') }, errors });
		clearLoginFailures(address);
		finishSetup(username, password);
		// in, as the admin: the account's own setup comes next
		try {
			await signInWith(event, 'local', { username, password }, '/');
		} catch (e) {
			if (isRedirect(e)) throw e;
		}
		redirect(303, '/signin?local');
	}
};
