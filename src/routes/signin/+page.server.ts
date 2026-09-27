import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { devLoginEnabled, googleEnabled, localAdminEnabled, signInWith } from '../../auth';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { safeReturn } from '$lib/server/redirect';
import { setupNeeded } from '$lib/server/setup';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	// a new server: first, the admin login
	if (setupNeeded()) redirect(303, '/first-run');
	const error = url.searchParams.get('error');
	return {
		google: googleEnabled(),
		local: localAdminEnabled(),
		dev: devLoginEnabled(),
		// Without Google the local admin form is the only way in, so show it on phones too.
		showLocal: url.searchParams.has('local') || !googleEnabled(),
		host: url.host,
		redirectTo: safeReturn(url.searchParams.get('redirectTo')),
		error: error
			? error === 'CredentialsSignin'
				? 'Wrong username or password.'
				: error === 'AccessDenied'
					? "This Google account isn't allowed on this server. Ask the server owner to add it."
					: "Couldn't sign you in. Try again."
			: null
	};
};

/** Sign in with this form's credentials and redirectTo. */
function withProvider(event: Parameters<Actions[string]>[0], providerId: string, fields: string[]) {
	return event.request.formData().then((form) =>
		signInWith(event, providerId, Object.fromEntries(fields.map((f) => [f, String(form.get(f) ?? '')])), safeReturn(form.get('redirectTo')))
	);
}

/** Auth.js throws on a failed credentials sign-in; turn that into a form error. */
async function attempt(run: () => Promise<unknown>, failure: string) {
	try {
		await run();
	} catch (e) {
		if (isRedirect(e)) throw e;
		const type = (e as { type?: string }).type;
		return fail(400, { error: type === 'CredentialsSignin' ? failure : "Couldn't sign you in. Try again." });
	}
}

export const actions: Actions = {
	google: (event) => attempt(() => withProvider(event, 'google', []), "Couldn't sign you in. Try again."),
	local: async (event) => {
		if (!localAdminEnabled()) return fail(404);
		const address = event.getClientAddress();
		const wait = loginBlockedMinutes(address);
		if (wait) return fail(429, { error: `Too many tries. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` });
		try {
			const failed = await attempt(() => withProvider(event, 'local', ['username', 'password']), 'Wrong username or password.');
			if (failed) recordLoginFailure(address);
			return failed;
		} catch (e) {
			if (isRedirect(e)) clearLoginFailures(address); // signed in
			throw e;
		}
	},
	dev: async (event) => {
		if (!devLoginEnabled()) return fail(404);
		return attempt(() => withProvider(event, 'dev', ['email', 'name']), 'Enter a valid email.');
	}
};
