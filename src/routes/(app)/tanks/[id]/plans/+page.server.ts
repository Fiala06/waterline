import { PLAN_TEMPLATES, planDays } from '$lib/plans';
import { safeReturn } from '$lib/server/redirect';
import { listPlanRuns } from '$lib/server/plans';
import { getTank } from '$lib/server/tanks';
import type { PageServerLoad } from './$types';

// Treatment plans (#177): the starters to pick from, and the tank's plans, running and past.
export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id);
	const entry = url.searchParams.get('entry');
	return {
		tank: { id: tank.id, name: tank.name },
		templates: PLAN_TEMPLATES.map((t) => ({ key: t.key, name: t.name, lead: t.lead, days: planDays(t.steps) })),
		plans: listPlanRuns(user.id, user.timeZone, tank.id),
		entry: entry && /^[\w-]{1,64}$/.test(entry) ? entry : null,
		from: safeReturn(url.searchParams.get('from'), '/tasks')
	};
};
