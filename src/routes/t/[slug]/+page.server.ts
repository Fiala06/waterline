import { CHART_RANGES, findPublic, LOG_RANGES, ogVersion, publicRanges, publicSettings, publicView, recordView } from '$lib/server/public';
import { tankCardAlt } from '$lib/server/og';
import type { PageServerLoad } from './$types';

// Public, server-rendered, read-only tank page (P2 / P3).
export const load: PageServerLoad = ({ params, request, url, locals }) => {
	const { page, tank, user } = findPublic(params.slug);
	const ranges = publicRanges(url);
	const view = publicView(page, tank, user, ranges);
	if (locals.user?.id !== user.id) recordView(tank.id, request.headers.get('user-agent'));
	const s = publicSettings();
	const base = s.baseUrl ?? url.origin;
	const canonical = `${base}/t/${page.slug}`;
	const title = page.seoTitle || `${tank.name} · ${view.type} aquarium log`;
	const description =
		page.seoDescription ||
		`Water parameters, trends and photos from ${view.name}, a ${view.type.toLowerCase()} aquarium${view.volume ? ` (${view.volume})` : ''}.`;
	return {
		view,
		ranges,
		chartRanges: CHART_RANGES.map((r) => ({ key: r.key, label: r.label })),
		logRanges: LOG_RANGES.map((r) => ({ key: r.key, label: r.label })),
		isOwner: locals.user?.id === user.id,
		ownerTankId: locals.user?.id === user.id ? tank.id : null,
		seo: {
			title,
			description,
			canonical,
			indexable: page.indexable,
			image: `${base}/t/${page.slug}/og.png?v=${ogVersion(page, tank)}`,
			imageAlt: tankCardAlt(view),
			siteName: 'Waterline'
		},
		analytics: { ga4Id: s.ga4Id, consent: s.consentBanner },
		verification: s.searchConsoleTag
	};
};
