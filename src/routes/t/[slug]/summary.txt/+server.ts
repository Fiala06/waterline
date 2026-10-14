import { CHART_RANGES, findPublic, publicRanges, publicSettings, publicView } from '$lib/server/public';
import { forumSummary, publicDetail } from '$lib/server/public-detail';
import type { RequestHandler } from './$types';

// The public page as plain text for a forum post: "Copy summary" without scripts opens this.
export const GET: RequestHandler = ({ params, url }) => {
	const { page, tank, user } = findPublic(params.slug);
	const ranges = publicRanges(url);
	const view = publicView(page, tank, user, ranges);
	const detail = publicDetail(page, tank, user, { days: CHART_RANGES.find((r) => r.key === ranges.chart)!.days });
	const base = publicSettings().baseUrl ?? url.origin;
	const text = forumSummary(detail, { name: view.name, type: view.type, volume: view.volume, keeper: view.keeper, url: `${base}/t/${page.slug}`, periodTitle: view.ranges.chart.title });
	return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, max-age=60' } });
};
