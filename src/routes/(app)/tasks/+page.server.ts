import { error, redirect } from '@sveltejs/kit';
import { addDays, fmtDate, isDate, todayInZone } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { safeReturn } from '$lib/server/redirect';
import { listTanks } from '$lib/server/tanks';
import { taskFormValues } from '$lib/server/task-form';
import { completeTask, getTask, listTasks, snoozeTask, undoCompletion } from '$lib/server/tasks';
import { effectiveDue } from '$lib/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const filter = url.searchParams.get('filter');
	const rows = listTasks(user.id, filter ?? undefined);

	// Desktop edit pane (D5): ?edit=<task id>, ?new, or else the first task in the list,
	// so the pane is never empty (phones hide it). The task must be in the list shown.
	const editing = rows.find((r) => r.task.id === url.searchParams.get('edit'))?.task;
	let pane: { mode: 'new' | 'edit'; taskId: string | null; values: ReturnType<typeof taskFormValues> } | null = null;
	if (!editing && url.searchParams.has('new')) {
		pane = { mode: 'new', taskId: null, values: taskFormValues(null, user, filter) };
	} else {
		const task = editing ?? rows[0]?.task;
		if (task) pane = { mode: 'edit', taskId: task.id, values: taskFormValues(task, user, null) };
	}

	return {
		filter,
		today: todayInZone(user.timeZone),
		tasks: rows.map((r) => r.task),
		pane,
		formTanks: listTanks(user.id).map((t) => ({ id: t.id, name: t.name }))
	};
};

export const actions: Actions = {
	done: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = str(form, 'taskId');
		if (!taskId) error(400, 'Missing task');
		const task = getTask(user.id, taskId);

		// Completing a water change or test opens the matching log form.
		if (task.openFormOnDone && (task.kind === 'water_change' || task.kind === 'test')) {
			const q = new URLSearchParams({ tank: task.tankId, task: task.id });
			if (task.kind === 'test') redirect(303, `/entries/test/new?${q}`);
			q.set('category', 'water_change');
			redirect(303, `/entries/event/new?${q}`);
		}

		const done = completeTask(user.id, taskId, { timeZone: user.timeZone });
		setFlash(cookies, `✓ ${task.name} done${done.nextDue ? ` · next ${fmtDate(done.nextDue)}` : ''}`, {
			undo: { action: '/tasks?/undo', name: 'completionId', value: done.completionId }
		});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	snooze: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = str(form, 'taskId');
		if (!taskId) error(400, 'Missing task');
		const until = str(form, 'until');
		const date = isDate(until) ? until : addDays(todayInZone(user.timeZone), 1);
		const due = effectiveDue(getTask(user.id, taskId));
		const after = due && due > todayInZone(user.timeZone) ? due : todayInZone(user.timeZone);
		if (date <= after) error(400, `Pick a date after ${fmtDate(after)}`);
		const task = snoozeTask(user.id, taskId, date);
		setFlash(cookies, `Snoozed ${task.name} to ${fmtDate(date)}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	undo: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const task = undoCompletion(locals.user!.id, str(form, 'completionId'));
		setFlash(cookies, `Undid ${task.name}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	}
};
