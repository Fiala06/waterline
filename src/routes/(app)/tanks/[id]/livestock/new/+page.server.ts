import { fail, redirect } from '@sveltejs/kit';
import { isDate, todayInZone, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { num, optStr, str } from '$lib/server/forms';
import { addLivestock } from '$lib/server/specs';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const t = getTank(locals.user!.id, params.id, 'log');
	return {
		tank: { id: t.id, name: t.name },
		// reef tanks search marine species, brackish both, everything else freshwater
		water: (t.type === 'reef' ? 'marine' : t.type === 'brackish' ? null : 'fresh') as 'marine' | 'fresh' | null,
		today: todayInZone(locals.user!.timeZone)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 80);
		const count = num(form, 'count') ?? 1;
		const kind = str(form, 'kind');
		const values = { name, scientificName: str(form, 'scientificName'), count: String(count), kind };
		if (!name) return fail(400, { error: 'Enter the species.', values });
		if (!Number.isInteger(count) || count < 1 || count > 10000) return fail(400, { error: 'Enter how many, 1 or more.', values });
		const today = todayInZone(user.timeZone);
		const picked = optStr(form, 'addedAt');
		const addedAt = picked && isDate(picked) ? picked : today;
		const { row } = addLivestock(
			user.id,
			params.id,
			{
				kind: kind === 'invert' || kind === 'coral' ? kind : 'fish',
				commonName: name,
				scientificName: optStr(form, 'scientificName', 120),
				count,
				status: str(form, 'status') === 'quarantine' ? 'quarantine' : 'in_tank',
				addedAt,
				source: optStr(form, 'source', 120)
			},
			// added on an earlier day: the History entry (and the timeline, #26) sit on that day
			{ at: addedAt < today ? zonedToUtc(addedAt, '12:00', user.timeZone).toISOString() : undefined }
		);
		setFlash(cookies, `✓ Added ${count} ${row.commonName}`);
		redirect(303, `/tanks/${params.id}/livestock`);
	}
};
