// The tank timeline (#26): the tank's photos in date order with the stats of
// each moment and what changed between, and two photos side by side (?a=&b=).
import { getTank } from '$lib/server/tanks';
import { byMonth, compareEntries, timelineEntries } from '$lib/server/timeline';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	if (!currentTankId) return { tank: null, months: [], compare: null, selected: null, count: 0, leftOut: 0 };
	const tank = getTank(user.id, currentTankId);
	const entries = timelineEntries(tank, user);
	const a = url.searchParams.get('a');
	const b = url.searchParams.get('b');
	const compare = a && b ? compareEntries(entries, a, b) : null;
	return {
		tank: { id: tank.id, name: tank.name, startDate: tank.startDate },
		months: byMonth(entries),
		count: entries.length,
		compare,
		// the first photo picked for a comparison, waiting for the second
		selected: a && !compare && entries.some((e) => e.id === a) ? a : null
	};
};
