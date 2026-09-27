import { summaryDays, tankSummary } from '$lib/server/summary';
import { getTank } from '$lib/server/tanks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const t = getTank(user.id, params.id);
	const days = summaryDays(url);
	return { tank: { id: t.id, name: t.name }, days, text: tankSummary(user, t.id, days) };
};
