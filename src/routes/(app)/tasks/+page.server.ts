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

	// Desktop edit pane (D5): ?edit=<task id> or ?new
	const editId = url.searchParams.get('edit');
	let pane: { mode: 'new' | 'edit'; taskId: string | null; values: ReturnType<typeof taskFormValues> } | null = null;
	if (editId) {
		try {
			pane = { mode: 'edit', taskId: editId, values: taskFormValues(getTask(user.id, editId), user, null) };
		} catch {
			pane = null;
		}
	} else if (url.searchParams.has('new')) {
		pane = { mode: 'new', taskId: null, values: taskFormValues(null, user, filter) };
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
			if (task.kind === 'test') redirect(303, `/log/test?${q}`);
			q.set('category', 'water_change');
			redirect(303, `/log/event?${q}`);
		}

		const done = completeTask(user.id, taskId, { timeZone: user.timeZone });
		setFlash(cookies, `✓ ${task.name} done${done.nextDue ? ` · next ${fmtDate(done.nextDue)}` : ''}`, {
			undo: done.completionId
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
