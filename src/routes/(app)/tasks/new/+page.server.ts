import { redirect } from '@sveltejs/kit';
import { listTanks } from '$lib/server/tanks';
import { saveTaskAction, taskFormValues } from '$lib/server/task-form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	const user = locals.user!;
	const { currentTankId } = await parent();
	const tanks = listTanks(user.id).map((t) => ({ id: t.id, name: t.name }));
	if (!tanks.length) redirect(303, '/tanks/new');
	const tankId = tanks.find((t) => t.id === url.searchParams.get('tank'))?.id ?? currentTankId;
	return { formTanks: tanks, values: taskFormValues(null, user, tankId) };
};

export const actions: Actions = { save: (e) => saveTaskAction(e, null) };
