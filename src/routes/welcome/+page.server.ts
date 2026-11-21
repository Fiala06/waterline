// The product homepage (#300): what Waterline is, for someone arriving from a
// forum link, with Sign in, self-hosting and (when it's on) the public tanks.
// Off unless the admin turns it on; it says nothing about access, limits or
// price beyond the line the admin wrote. Signed in, it's still here, but / is the app.
import { error } from '@sveltejs/kit';
import { publicSettings } from '$lib/server/public';
import type { PageServerLoad } from './$types';

const REPO_URL = 'https://github.com/Fiala06/waterline';

export const load: PageServerLoad = ({ url, locals }) => {
	const s = publicSettings();
	if (!s.landingEnabled) error(404, 'Not found');
	const base = s.baseUrl ?? url.origin;
	const host = new URL(base).host;
	return {
		host,
		signedIn: !!locals.user,
		access: s.landingAccess,
		publicTanks: s.allowPublicPages && s.publicHomeEnabled,
		repo: REPO_URL,
		seo: {
			title: 'Waterline · an aquarium log for water tests, reminders and care',
			description: 'Log your freshwater tank’s water tests and see the trends, get reminded about water changes and upkeep, keep a journal, and track what it costs. Free, open-source software you can also run yourself.',
			canonical: `${base}/welcome`,
			indexable: true,
			image: `${base}/screenshots/share-card.png`,
			imageAlt: 'Waterline’s dashboard for a planted tank: nitrate high, iron and KH near low, and the water change due',
			siteName: 'Waterline'
		}
	};
};
