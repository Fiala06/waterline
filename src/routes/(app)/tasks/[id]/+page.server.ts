import { listTanks, roleOn } from '$lib/server/tanks';
import { deleteTaskAction, routineProducts, saveTaskAction, taskFormValues } from '$lib/server/task-form';
import { courseDay, getTask, recentCompletions } from '$lib/server/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	const task = getTask(user.id, params.id);
	return {
		taskId: task.id,
		formTanks: listTanks(user.id).filter((t) => roleOn(user.id, t) === 'owner').map((t) => ({ id: t.id, name: t.name })),
		values: taskFormValues(task, user, null),
		products: routineProducts(user.id),
		done: recentCompletions(task.id, user.timeZone),
		course: courseDay(task, user.timeZone)
	};
};

export const actions: Actions = {
	save: (e) => saveTaskAction(e, e.params.id),
	delete: (e) => deleteTaskAction(e, e.params.id)
};
