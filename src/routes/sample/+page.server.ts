// The sample tank (#301): a made-up planted tank, shown as a public tank page, for
// visitors to look around before signing in. Off unless the admin turns it on; it's
// never saved, never indexed, and never counted or measured (no analytics).
import { error } from '@sveltejs/kit';
import { CHART_RANGES, publicRanges, publicSettings } from '$lib/server/public';
import { forumSummary } from '$lib/server/public-detail';
import { SAMPLE_PATH, sampleTank } from '$lib/server/sample-tank';
import type { SampleExtras } from '$lib/sample';
import { publicSpeciesPhotos } from '$lib/server/public-species';
import type { PageServerLoad } from './$types';

const REPO = 'https://github.com/Fiala06/waterline';

export const load: PageServerLoad = ({ url, setHeaders }) => {
	const s = publicSettings();
	if (!s.sampleEnabled) error(404, 'Not found');
	const ranges = publicRanges(url);
	const { view, detail, spending } = sampleTank(ranges);
	const base = s.baseUrl ?? url.origin;
	setHeaders({ 'x-robots-tag': 'noindex' });
	const sample: SampleExtras = { spending, access: s.landingAccess, repo: REPO };
	return {
		view,
		detail,
		// the species' photos from Wikimedia Commons, by name, for the livestock and plant cards
		speciesPhotos: publicSpeciesPhotos([...detail.animals, ...detail.plants].map((x) => x.lookup), SAMPLE_PATH),
		summary: forumSummary(detail, { name: view.name, type: view.type, volume: view.volume, keeper: view.keeper, url: `${base}${SAMPLE_PATH}`, periodTitle: view.ranges.chart.title }),
		ranges,
		chartRanges: CHART_RANGES.map((r) => ({ key: r.key, label: r.label })),
		ownerTankId: null,
		base: SAMPLE_PATH,
		sample,
		seo: {
			title: 'Sample tank · Waterline',
			description: 'A made-up planted tank in Waterline: water tests against targets, water changes on the chart, the care log, reminders and spending.',
			canonical: `${base}${SAMPLE_PATH}`,
			indexable: false,
			image: `${base}/screenshots/share-card.png`,
			imageAlt: 'Waterline’s dashboard for a planted tank',
			siteName: 'Waterline'
		},
		analytics: { ga4Id: null, consent: false },
		verification: null
	};
};
