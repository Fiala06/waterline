// Connecting an app by signing in (#9): the keeper, signed in, sees which app
// asks and where it goes back to, picks the tanks it may read, and allows or
// cancels. The forms post to this page's own address, so the app's request
// rides along in the query (and a refused Allow shows the page again).
import { fail, redirect } from '@sveltejs/kit';
import { approve, deny, readAuthorize } from '$lib/server/assistant/oauth';
import { logger } from '$lib/server/log';
import { listTanks } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

function request(q: URLSearchParams, origin: string) {
	const r = readAuthorize(q, origin);
	if ('back' in r) redirect(303, r.back);
	return r;
}

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const r = request(url.searchParams, url.origin);
	if ('page' in r) return { problem: r.page };
	return {
		problem: null,
		app: r.ok.client.name,
		returnsTo: new URL(r.ok.redirectUri).host || r.ok.redirectUri.split(':')[0],
		// the app's request, without the action's own ?/allow
		q: new URLSearchParams([...url.searchParams].filter(([k]) => !k.startsWith('/'))).toString(),
		email: user.email,
		tanks: listTanks(user.id).map((t) => ({ id: t.id, name: t.name }))
	};
};

export const actions: Actions = {
	allow: async ({ request: req, locals, url }) => {
		const user = locals.user!;
		const form = await req.formData();
		const r = request(url.searchParams, url.origin);
		if ('page' in r) return fail(400, { error: r.page, picked: null as string[] | null });
		const tankIds = form.getAll('tank').map(String);
		if (!tankIds.length) return fail(400, { error: 'Pick at least one tank.', picked: [] as string[] | null });
		logger.info('assistant', `"${r.ok.client.name}" connected by signing in`, { userId: user.id, returnsTo: new URL(r.ok.redirectUri).origin });
		redirect(303, approve(user.id, r.ok, tankIds, url.origin));
	},
	cancel: ({ url }) => {
		const r = request(url.searchParams, url.origin);
		if ('page' in r) redirect(303, '/settings/assistant');
		redirect(303, deny(r.ok, url.origin));
	}
};
