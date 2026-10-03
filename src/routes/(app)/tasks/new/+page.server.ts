import { redirect } from '@sveltejs/kit';
import { listTanks, roleOn } from '$lib/server/tanks';
import { routineProducts, saveTaskAction, taskFormValues, taskPreset, taskType } from '$lib/server/task-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	// a shared tank's reminders are its owner's to set (#22)
	const tanks = listTanks(user.id).filter((t) => roleOn(user.id, t) === 'owner').map((t) => ({ id: t.id, name: t.name }));
	if (!tanks.length) redirect(303, '/tanks/new');
	const tankId = tanks.find((t) => t.id === url.searchParams.get('tank'))?.id ?? currentTankId;
	// ?type=dosing or feeding: a routine (#17); ?from: where it was started, to go back to
	const type = taskType(url.searchParams.get('type'));
	const from = url.searchParams.get('from') ?? '';
	return {
		formTanks: tanks,
		// ?product, ?every, ?ends, ?amount: filled in by a link (a treatment course from a health entry)
		values: taskFormValues(null, user, tankId, type, taskPreset(url.searchParams)),
		products: routineProducts(user.id),
		from: from.startsWith('/tanks/') ? from : null
	};
};

export const actions: Actions = { save: (e) => saveTaskAction(e, null) };
