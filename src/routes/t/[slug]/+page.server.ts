import { CHART_RANGES, findPublic, ogVersion, publicRanges, publicSettings, publicView, recordView } from '$lib/server/public';
import { tankCardAlt } from '$lib/server/og';
import { forumSummary, publicDetail } from '$lib/server/public-detail';
import type { SampleExtras } from '$lib/sample';
import { publicSpeciesPhotos } from '$lib/server/public-species';
import type { PageServerLoad } from './$types';

// Public, server-rendered, read-only tank page (P2 / P3).
export const load: PageServerLoad = ({ params, request, url, locals }) => {
	const { page, tank, user } = findPublic(params.slug);
	const ranges = publicRanges(url);
	const view = publicView(page, tank, user, ranges);
	// the diagnostic detail, over the visitor's chart range
	const detail = publicDetail(page, tank, user, { days: view.ranges.chart.days });
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
		detail,
		// the species' photos from Wikimedia Commons, by name, for the livestock and plant cards
		speciesPhotos: publicSpeciesPhotos([...detail.animals, ...detail.plants].map((x) => x.lookup), `/t/${page.slug}`),
		// the page as text for a forum post, for "Copy summary"
		summary: forumSummary(detail, { name: view.name, type: view.type, volume: view.volume, keeper: view.keeper, url: canonical, periodTitle: view.ranges.chart.title }),
		ranges,
		chartRanges: CHART_RANGES.map((r) => ({ key: r.key, label: r.label })),
		ownerTankId: locals.user?.id === user.id ? tank.id : null,
		// where the page lives, for its range links; the sample tank (#301) shows the same page at /sample
		base: `/t/${page.slug}`,
		sample: null as SampleExtras | null,
		seo: {
			title,
			description,
			canonical,
			indexable: page.indexable,
			image: `${base}/t/${page.slug}/og.png?v=${ogVersion(page, tank, view)}`,
			imageAlt: tankCardAlt(view),
			siteName: 'Waterline'
		},
		analytics: { ga4Id: s.ga4Id, consent: s.consentBanner },
		verification: s.searchConsoleTag
	};
};
