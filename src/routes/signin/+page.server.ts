import { fail, isRedirect } from '@sveltejs/kit';
import { devLoginEnabled, googleEnabled, localAdminEnabled, signIn } from '../../auth';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { safeReturn } from '$lib/server/redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const error = url.searchParams.get('error');
	return {
		google: googleEnabled(),
		local: localAdminEnabled(),
		dev: devLoginEnabled(),
		showLocal: url.searchParams.has('local'),
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

/** Rebuild the request so Auth.js sees providerId + credentials + redirectTo. */
function withProvider(event: Parameters<Actions[string]>[0], providerId: string, fields: string[]) {
	return event.request.formData().then((form) => {
		const body = new FormData();
		body.set('providerId', providerId);
		body.set('redirectTo', safeReturn(form.get('redirectTo')));
		for (const f of fields) body.set(f, String(form.get(f) ?? ''));
		const headers = new Headers(event.request.headers);
		headers.delete('content-type');
		headers.delete('content-length');
		const request = new Request(event.request.url, { method: 'POST', body, headers });
		return signIn({ ...event, request });
	});
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
