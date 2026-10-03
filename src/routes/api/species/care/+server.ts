// Care for one species against a tank (#20), for the Add livestock form as a
// species is picked: its ranges in the keeper's units, and what to check.
import { error, json } from '@sveltejs/kit';
import { careLine, groupWarning, tankTargets, targetWarnings } from '$lib/care';
import { CARE_SOURCE, careFor, speciesCareOn } from '$lib/server/species-care';
import { getTank, listParams } from '$lib/server/tanks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, url }) => {
	const user = locals.user;
	if (!user) error(401);
	const s = (url.searchParams.get('s') ?? '').trim();
	const name = (url.searchParams.get('name') ?? '').trim() || s;
	const count = Math.max(1, Number(url.searchParams.get('count')) || 1);
	const tankId = url.searchParams.get('tank');
	if (!s || !speciesCareOn()) return json({ care: null, warnings: [] });
	const care = careFor(s);
	const warnings: string[] = [];
	if (tankId) {
		const tank = getTank(user.id, tankId);
		if (care) warnings.push(...targetWarnings(name, care, tankTargets(listParams(tank.id)), user));
	}
	const g = groupWarning({ s, name, count }, care);
	if (g) warnings.push(g);
	return json({ care: care ? { line: careLine(care, user), source: CARE_SOURCE } : null, warnings }, { headers: { 'cache-control': 'private, no-store' } });
};
