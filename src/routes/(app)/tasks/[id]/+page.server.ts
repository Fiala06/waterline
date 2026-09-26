import { listTanks } from '$lib/server/tanks';
import { deleteTaskAction, saveTaskAction, taskFormValues } from '$lib/server/task-form';
import { getTask } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const task = getTask(user.id, params.id);
	return {
		taskId: task.id,
		formTanks: listTanks(user.id).map((t) => ({ id: t.id, name: t.name })),
		values: taskFormValues(task, user, null)
	};
};

export const actions: Actions = {
	save: (e) => saveTaskAction(e, e.params.id),
	delete: (e) => deleteTaskAction(e, e.params.id)
};
