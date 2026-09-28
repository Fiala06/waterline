import { fail, redirect } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import { addSeveral } from '$lib/server/add-several';
import { setFlash } from '$lib/server/flash';
import { logger } from '$lib/server/log';
import { getTank } from '$lib/server/tanks';
import type { Actions, PageServerLoad } from './$types';

// Add several livestock at once, picked from the species list.
export const load: PageServerLoad = ({ locals, params }) => {
	const t = getTank(locals.user!.id, params.id);
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
		const t = getTank(user.id, params.id);
		const water = t.type === 'reef' ? 'marine' : t.type === 'brackish' ? null : 'fresh';
		const done = addSeveral('livestock', await request.formData(), user, t.id, water);
		if ('error' in done) return fail(400, { error: done.error });
		logger.info('import', `Added several livestock: ${done.message.slice(2)}`, { userId: user.id });
		setFlash(cookies, done.message, { undo: { action: `/tanks/${t.id}/import/livestock?/undo`, name: 'importId', value: done.importId } });
		redirect(303, `/tanks/${t.id}/livestock`);
	}
};
