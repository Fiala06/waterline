import { summaryDays, tankSummary } from '$lib/server/summary';
import { getTank } from '$lib/server/tanks';
import { todayInZone } from '$lib/time';
import type { RequestHandler } from './$types';

/** The summary as a Markdown file, for assistants that take attachments. */
export const GET: RequestHandler = ({ locals, params, url }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const slug =
		t.name
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'tank';
	return new Response(tankSummary(user, t.id, summaryDays(url)), {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="waterline-${slug}-${todayInZone(user.timeZone)}.md"`,
			'cache-control': 'no-store'
		}
	});
};
