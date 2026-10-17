import { CHART_RANGES, findPublic, publicRanges } from '$lib/server/public';
import { publicDetail, testsCsv } from '$lib/server/public-detail';
import type { RequestHandler } from './$types';

// The public page's water tests as CSV (?chart= picks the period, as on the page);
// only what the page shows: no times or notes unless the owner shares detail.
export const GET: RequestHandler = ({ params, url }) => {
	const { page, tank, user } = findPublic(params.slug);
	const ranges = publicRanges(url);
	const days = CHART_RANGES.find((r) => r.key === ranges.chart)!.days;
	const detail = publicDetail(page, tank, user, { days });
	const name = `${page.slug}-tests-${ranges.chart}.csv`;
	return new Response(testsCsv(detail), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'private, max-age=60'
		}
	});
};
