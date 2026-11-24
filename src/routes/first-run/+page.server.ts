import { isRedirect, redirect } from '@sveltejs/kit';
import { signInWith } from '../../auth';
import { refuse, str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { codeMatches, finishSetup, setupCode, setupNeeded } from '$lib/server/setup';
import type { Actions, PageServerLoad } from './$types';
import { PASSWORD_HINT, PASSWORD_MIN, passwordProblem } from '$lib/server/password-policy';

// A new server's first page: the setup code from the log, then the admin login.
export const load: PageServerLoad = () => {
	if (!setupNeeded()) redirect(303, '/signin');
	setupCode(); // printed to the log, if it wasn't already
	return { passwordMin: PASSWORD_MIN, passwordHint: PASSWORD_HINT };
};

export const actions: Actions = {
	default: async (event) => {
		if (!setupNeeded()) redirect(303, '/signin');
		const address = event.getClientAddress();
		const form = await event.request.formData();
		const username = str(form, 'username') || 'admin';
		const values = { username, code: '' };
		const wait = loginBlockedMinutes(address);
		if (wait) return refuse('setup', { code: `Too many tries. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` }, values, 429);
		if (!codeMatches(str(form, 'code'))) {
			recordLoginFailure(address);
			logger.warn('setup', 'Wrong setup code entered', { address });
			return refuse('setup', { code: "That isn't the setup code. Copy it from the server's log." }, values);
		}
		const password = String(form.get('password') ?? '');
		const errors: Record<string, string> = {};
		if (!/^[\w.@-]{1,40}$/.test(username)) errors.username = 'Use letters, numbers, dots, dashes or underscores.';
		const weak = passwordProblem(password, [username]);
		if (weak) errors.password = weak;
		else if (password !== String(form.get('confirm') ?? '')) errors.confirm = "The passwords don't match.";
		// the right code stays in the form while the rest is fixed
		if (Object.keys(errors).length) return refuse('setup', errors, { ...values, code: str(form, 'code') });
		clearLoginFailures(address);
		finishSetup(username, password);
		logger.info('setup', `Admin login “${username}” created on first start`);
		// in, as the admin: the account's own setup comes next
		try {
			await signInWith(event, 'local', { username, password }, '/');
		} catch (e) {
			if (isRedirect(e)) throw e;
		}
		redirect(303, '/signin?local');
	}
};
