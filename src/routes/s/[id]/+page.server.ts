import { findShare, publicSettings } from '$lib/server/public';
import type { PageServerLoad } from './$types';

// A shared photo (D8): no sign-in; readings and other entries stay private.
export const load: PageServerLoad = ({ params, url }) => {
	const { photoId: _, ...share } = findShare(params.id); // the page needs no internal ids
	const s = publicSettings();
	const base = s.baseUrl ?? url.origin;
	const title = share.title ?? (share.tankName ? `Photo from ${share.tankName}` : 'Aquarium photo');
	return {
		share,
		seo: {
			title: `${title} · Waterline`,
			description: [share.tankName, share.date].filter(Boolean).join(' · ') || 'A photo shared from Waterline.',
			canonical: `${base}/s/${share.id}`,
			indexable: false,
			image: `${base}/s/${share.id}/og.png`,
			imageAlt: title,
			siteName: 'Waterline'
		},
		analytics: { ga4Id: s.ga4Id, consent: s.consentBanner }
	};
};
