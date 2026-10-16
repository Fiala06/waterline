import { error, redirect } from '@sveltejs/kit';
import { addDays, fmtDate, isDate, todayInZone, utcToZoned, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { safeReturn } from '$lib/server/redirect';
import { listTanks } from '$lib/server/tanks';
import { routineProducts, taskFormValues, taskType } from '$lib/server/task-form';
import { completeTask, countableEntry, getTask, lastDoneOn, listTasks, recentCompletions, skipTask, snoozeTask, undoCompletion } from '$lib/server/tasks';
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
		pane = { mode: 'new', taskId: null, values: taskFormValues(null, user, filter, taskType(url.searchParams.get('type'))) };
	} else {
		const task = editing ?? rows[0]?.task;
		if (task) pane = { mode: 'edit', taskId: task.id, values: taskFormValues(task, user, null) };
	}

	return {
		filter,
		today: todayInZone(user.timeZone),
		// a water change or test logged already that Skip can count instead (#163)
		tasks: rows.map((r) => ({ ...r.task, countable: countableEntry(r.task, user.timeZone), lastDone: lastDoneOn(r.task.id, user.timeZone) })),
		// the pane's task: the last few times it was done (#164)
		done: pane?.taskId ? recentCompletions(pane.taskId, user.timeZone) : [],
		pane,
		formTanks: listTanks(user.id).map((t) => ({ id: t.id, name: t.name })),
		products: routineProducts(user.id)
	};
};

export const actions: Actions = {
	done: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = str(form, 'taskId');
		if (!taskId) error(400, 'Missing task');
		const task = getTask(user.id, taskId);
		// Done on an earlier day (#162): that day, at this time of day, so the next one counts from it
		const today = todayInZone(user.timeZone);
		const doneOn = str(form, 'doneOn');
		if (doneOn && (!isDate(doneOn) || doneOn > today)) error(400, `Pick a day on or before ${fmtDate(today)}`);
		const earlier = doneOn && doneOn < today ? doneOn : null;

		// The setup review (#30) is done on its own page, where the parts are checked.
		if (task.kind === 'review') redirect(303, `/tanks/${task.tankId}/review`);

		// Completing a water change or test opens the matching log form.
		if (task.openFormOnDone && (task.kind === 'water_change' || task.kind === 'test')) {
			const q = new URLSearchParams({ tank: task.tankId, task: task.id });
			if (earlier) {
				q.set('date', earlier);
				q.set('time', utcToZoned(new Date(), user.timeZone).time);
			}
			if (task.kind === 'test') redirect(303, `/entries/test/new?${q}`);
			q.set('category', 'water_change');
			redirect(303, `/entries/event/new?${q}`);
		}

		const at = earlier ? zonedToUtc(earlier, utcToZoned(new Date(), user.timeZone).time, user.timeZone).toISOString() : undefined;
		const done = completeTask(user.id, taskId, { at, timeZone: user.timeZone });
		setFlash(cookies, `✓ ${task.name} done${earlier ? ` ${fmtDate(earlier)}` : ''}${done.nextDue ? ` · next ${fmtDate(done.nextDue)}` : ''}`, {
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
	/** Count the water change or test already logged as this one (#163), instead of skipping it */
	count: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = str(form, 'taskId');
		if (!taskId) error(400, 'Missing task');
		const task = getTask(user.id, taskId);
		const entry = countableEntry(task, user.timeZone);
		if (!entry || entry.id !== str(form, 'entryId')) error(409, 'That entry no longer counts for this task');
		const done = completeTask(user.id, taskId, {
			at: entry.at,
			...(entry.kind === 'event' ? { eventId: entry.id } : { logged: true }),
			timeZone: user.timeZone
		});
		setFlash(cookies, `✓ ${task.name} done ${fmtDate(entry.date)}${done.nextDue ? ` · next ${fmtDate(done.nextDue)}` : ''}`, {
			undo: { action: '/tasks?/undo', name: 'completionId', value: done.completionId }
		});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** Skip this one (#71): on to the next date, with Undo */
	skip: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const taskId = str(form, 'taskId');
		if (!taskId) error(400, 'Missing task');
		const task = skipTask(user.id, taskId, { timeZone: user.timeZone });
		setFlash(cookies, `Skipped ${task.name} · next ${fmtDate(task.nextDue)}`, {
			undo: { action: '/tasks?/undo', name: 'completionId', value: task.completionId }
		});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	undo: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const task = undoCompletion(locals.user!.id, str(form, 'completionId'));
		setFlash(cookies, `Undid ${task.name}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	}
};
