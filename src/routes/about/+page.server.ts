// About this server (#302): privacy, service and how to get help, for anyone,
// signed in or not. What the server does is worked out from its setup; who runs
// it, how to reach them and its terms are the admin's words, dated.
import { aboutServer } from '$lib/server/about';
import { publicSettings } from '$lib/server/public';
import { fmtDateLong } from '$lib/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals }) => {
	const a = aboutServer();
	const base = publicSettings().baseUrl ?? url.origin;
	return {
		host: new URL(base).host,
		signedIn: !!locals.user,
		...a,
		updated: a.updatedAt ? fmtDateLong(a.updatedAt.slice(0, 10)) : null,
		// the admin's terms, a paragraph per blank line
		termsParagraphs: (a.terms ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
		repo: 'https://github.com/Fiala06/waterline'
	};
};
