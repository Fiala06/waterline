import { error, redirect } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { safeReturn } from '$lib/server/redirect';
import { completeTask, getTask, listTasks, snoozeTask } from '$lib/server/tasks';
import { fmtDate } from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const filter = url.searchParams.get('filter');
	const rows = listTasks(user.id, filter ?? undefined);
	return {
		filter,
		today: todayInZone(user.timeZone),
		tasks: rows.map((r) => r.task)
	};
};

export const actions: Actions = {
	done: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) error(400, 'Missing task');
		const task = getTask(user.id, taskId);

		// Completing a water change or test opens the matching log form.
		if (task.openFormOnDone && (task.kind === 'water_change' || task.kind === 'test')) {
			const q = new URLSearchParams({ tank: task.tankId, task: task.id });
			if (task.kind === 'test') redirect(303, `/log/test?${q}`);
			q.set('category', 'water_change');
			redirect(303, `/log/event?${q}`);
		}

		const done = completeTask(user.id, taskId, { timeZone: user.timeZone });
		setFlash(cookies, `✓ ${task.name} done${done.nextDue ? ` · next due ${fmtDate(done.nextDue)}` : ''}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	snooze: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = String(form.get('taskId') ?? '');
		if (!taskId) error(400, 'Missing task');
		const task = snoozeTask(user.id, taskId, 1);
		setFlash(cookies, `Snoozed ${task.name} 1 day`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	}
};
