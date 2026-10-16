import { error, redirect } from '@sveltejs/kit';
import { addDays, fmtDate, isDate, todayInZone, utcToZoned, zonedToUtc } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { safeReturn } from '$lib/server/redirect';
import { listTanks } from '$lib/server/tanks';
import { routineProducts, taskFormValues, taskType } from '$lib/server/task-form';
import { algaeOf, completeTask, needsOwnDone, countableEntry, courseDay, endCourseEarly, getTask, reopenCourse, lastDoneOn, lastDoseText, listTasks, recentCompletions, resumeTask, skipTask, snoozeTask, undoCompletion, unpauseTasks } from '$lib/server/tasks';
import { effectiveDue } from '$lib/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const filter = url.searchParams.get('filter');
	const all = listTasks(user.id, filter ?? undefined, { paused: true });
	const rows = all.filter((r) => !r.task.paused);

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
		tasks: rows.map((r) => ({ ...r.task, countable: countableEntry(r.task, user.timeZone), lastDone: lastDoneOn(r.task.id, user.timeZone), lastDose: r.task.kind === 'dosing' ? lastDoseText(r.task, user.timeZone) : null, courseDay: courseDay(r.task, user.timeZone) })),
		// paused (#172), listed apart with Resume
		paused: all.filter((r) => r.task.paused).map((r) => ({ id: r.task.id, name: r.task.name, tankId: r.task.tankId, until: r.task.pausedUntil! })),
		// the pane's task: the last few times it was done (#164)
		done: pane?.taskId ? recentCompletions(pane.taskId, user.timeZone) : [],
		// a course (#174): where it stands, with End early
		course: (() => {
			const t = pane?.taskId ? rows.find((r) => r.task.id === pane!.taskId)?.task : null;
			return t ? courseDay(t, user.timeZone) : null;
		})(),
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
		// the last of a course started from an algae entry (#174): how does it look now?
		const algae = !done.nextDue && task.endsOn ? algaeOf(task.fromEventId) : null;
		if (algae) {
			setFlash(cookies, `✓ ${task.name} done · course finished. How does it look now?`);
			redirect(303, `/tanks/${task.tankId}/algae?${new URLSearchParams({ algae, from: safeReturn(form.get('from'), '/tasks') })}`);
		}
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
		const today = todayInZone(user.timeZone);
		const date = isDate(until) ? until : addDays(today, 1);
		const due = effectiveDue(getTask(user.id, taskId));
		// later than today, or today itself for a task not due yet: Do it today (#165) brings it forward
		if (date < today || (date === today && !(due && due > today))) error(400, `Pick a date after ${fmtDate(today)}`);
		const task = snoozeTask(user.id, taskId, date);
		setFlash(cookies, due && date < due ? `Moved ${task.name} to ${date === today ? 'today' : fmtDate(date)}` : `Snoozed ${task.name} to ${fmtDate(date)}`, {
			undo: { action: '/tasks?/unsnooze', name: 'taskId', value: `${task.id}|${due ?? ''}` }
		});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** Undo a snooze or a move: back to the date it had */
	unsnooze: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const [taskId, was] = str(form, 'taskId').split('|');
		const task = getTask(user.id, taskId);
		snoozeTask(user.id, taskId, isDate(was) ? was : (task.nextDue ?? ''));
		setFlash(cookies, `Undid ${task.name}`);
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
	/**
	 * Several done at once (#176): each as by its own Done, on the day or the day
	 * before; the setup review and tasks that open a log form are left for their own.
	 */
	doneMany: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const today = todayInZone(user.timeZone);
		const doneOn = str(form, 'doneOn');
		if (doneOn && (!isDate(doneOn) || doneOn > today)) error(400, `Pick a day on or before ${fmtDate(today)}`);
		const ids = [...new Set(form.getAll('taskId').map(String))].slice(0, 50);
		const at = doneOn && doneOn < today ? zonedToUtc(doneOn, utcToZoned(new Date(), user.timeZone).time, user.timeZone).toISOString() : undefined;
		const done: string[] = [];
		const left: string[] = [];
		for (const id of ids) {
			const task = getTask(user.id, id);
			if (needsOwnDone(task)) {
				left.push(task.name);
				continue;
			}
			done.push(completeTask(user.id, id, { at, timeZone: user.timeZone }).completionId);
		}
		const text = [done.length ? `✓ ${done.length} done${at ? ` ${fmtDate(doneOn)}` : ''}` : 'Nothing marked done', left.length ? `${left.join(', ')} ${left.length === 1 ? 'needs its' : 'need their'} own Done` : null]
			.filter(Boolean)
			.join(' · ');
		setFlash(cookies, text, done.length ? { undo: { action: '/tasks?/undoMany', name: 'completions', value: done.join(',') } } : {});
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** Undo several done at once */
	undoMany: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const ids = str(form, 'completions').split(',').filter(Boolean).slice(0, 50);
		for (const id of ids) undoCompletion(user.id, id);
		setFlash(cookies, `Undid ${ids.length === 1 ? '1 task' : `${ids.length} tasks`}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** End a course before its last day (#174), with Undo */
	endCourse: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const note = endCourseEarly(user.id, str(form, 'taskId'));
		setFlash(cookies, 'Course ended early', { undo: { action: '/tasks?/reopenCourse', name: 'note', value: note.id } });
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	reopenCourse: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const task = reopenCourse(user.id, str(form, 'note'));
		setFlash(cookies, `Undid ${task.name}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** Resume a paused task now (#172), its dates moved on by the days it was paused */
	resume: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const task = resumeTask(user.id, str(form, 'taskId'), user.timeZone);
		setFlash(cookies, `Resumed ${task.name}`);
		redirect(303, safeReturn(form.get('from'), '/tasks'));
	},
	/** Undo a pause: as it was, and out of History */
	unpause: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		unpauseTasks(user.id, str(form, 'notes').split(',').filter(Boolean));
		setFlash(cookies, 'Undid the pause');
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
