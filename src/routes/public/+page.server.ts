import { error } from '@sveltejs/kit';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { displayNameFor, publicSettings, publicTanksForHome } from '$lib/server/public';
import type { PageServerLoad } from './$types';

// Public home (P5): lists public, indexable tanks on this server.
export const load: PageServerLoad = ({ url }) => {
	const s = publicSettings();
	if (!s.allowPublicPages || !s.publicHomeEnabled) error(404, 'Not found');
	const base = s.baseUrl ?? url.origin;
	return {
		host: new URL(base).host,
		tanks: publicTanksForHome().map(({ page, tank, user }) => ({
			slug: page.slug,
			name: tank.name,
			type: tank.type.charAt(0).toUpperCase() + tank.type.slice(1),
			volume: tank.nominalVolumeL != null ? `${formatNumber(toDisplay(tank.nominalVolumeL, 'volume', user), 1)} ${unitLabel('volume', user)}` : null,
			keeper: displayNameFor(user, page.displayName),
			cover: tank.coverPhotoId
		})),
		seo: {
			title: `Aquariums on ${new URL(base).host} · Waterline`,
			description: 'Public aquarium logs: water parameters, trends and photos.',
			canonical: `${base}/public`,
			indexable: true,
			image: '',
			imageAlt: '',
			siteName: 'Waterline'
		}
	};
};
