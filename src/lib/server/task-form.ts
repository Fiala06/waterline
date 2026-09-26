import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { todayInZone } from '$lib/time';
import type { Task, User } from './db/schema';
import { setFlash } from './flash';
import { num, str } from './forms';
import { listTanks } from './tanks';
import { createTask, deleteTask, getTask, updateTask, type TaskInput } from './tasks';

export type OnDone = 'none' | 'test' | 'water_change';

/** Form values for a task (15 / D5). */
export function taskFormValues(task: Task | null, user: User, tankId: string | null) {
	if (!task) {
		return {
			name: '',
			tankId: tankId ?? listTanks(user.id)[0]?.id ?? '',
			recurring: true,
			every: '1',
			unit: 'weeks' as const,
			nextDue: todayInZone(user.timeZone),
			scheduleMode: 'completion' as const,
			onDone: 'none' as OnDone
		};
	}
	const d = task.intervalDays ?? 7;
	const weeks = d % 7 === 0;
	return {
		name: task.name,
		tankId: task.tankId,
		recurring: task.recurring,
		every: String(weeks ? d / 7 : d),
		unit: weeks ? ('weeks' as const) : ('days' as const),
		nextDue: task.snoozedUntil && task.nextDue && task.snoozedUntil > task.nextDue ? task.snoozedUntil : (task.nextDue ?? todayInZone(user.timeZone)),
		scheduleMode: task.scheduleMode,
		onDone: (task.openFormOnDone && (task.kind === 'test' || task.kind === 'water_change') ? task.kind : 'none') as OnDone
	};
}

function parse(form: FormData, existing: Task | null) {
	const errors: Record<string, string> = {};
	const name = str(form, 'name').slice(0, 80);
	if (!name) errors.name = 'Give the task a name.';
	const recurring = str(form, 'recurring') !== 'no';
	const every = num(form, 'every');
	const unit = str(form, 'unit') === 'days' ? 1 : 7;
	if (recurring && (every == null || every < 1 || !Number.isInteger(every) || every * unit > 3650))
		errors.every = 'Enter a whole number of days or weeks.';
	const nextDue = str(form, 'nextDue');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) errors.nextDue = 'Pick a date.';
	const onDone = str(form, 'onDone') as OnDone;

	let kind: Task['kind'];
	if (onDone === 'water_change' || onDone === 'test') kind = onDone;
	else if (existing) kind = existing.kind;
	else kind = /water change/i.test(name) ? 'water_change' : /\btest/i.test(name) ? 'test' : 'maintenance';

	const input: TaskInput & { tankId: string } = {
		name,
		tankId: str(form, 'tankId'),
		kind,
		recurring,
		intervalDays: recurring ? (every ?? 1) * unit : null,
		scheduleMode: str(form, 'scheduleMode') === 'fixed' ? 'fixed' : 'completion',
		nextDue,
		openFormOnDone: onDone !== 'none'
	};
	return { errors, input };
}

const formValues = (form: FormData) => ({
	name: str(form, 'name'),
	tankId: str(form, 'tankId'),
	recurring: str(form, 'recurring') !== 'no',
	every: str(form, 'every'),
	unit: (str(form, 'unit') === 'days' ? 'days' : 'weeks') as 'days' | 'weeks',
	nextDue: str(form, 'nextDue'),
	scheduleMode: (str(form, 'scheduleMode') === 'fixed' ? 'fixed' : 'completion') as 'completion' | 'fixed',
	onDone: str(form, 'onDone') as OnDone
});

export async function saveTaskAction({ request, locals, cookies }: RequestEvent, taskId: string | null) {
	const user = locals.user!;
	const existing = taskId ? getTask(user.id, taskId) : null;
	const form = await request.formData();
	const { errors, input } = parse(form, existing);
	if (Object.keys(errors).length) return fail(400, { errors, values: formValues(form) });
	if (existing) updateTask(user.id, existing.id, input);
	else createTask(user.id, input.tankId, input);
	setFlash(cookies, existing ? '✓ Task saved' : `✓ ${input.name} added`);
	redirect(303, '/tasks');
}

export function deleteTaskAction({ locals, cookies }: RequestEvent, taskId: string) {
	const task = deleteTask(locals.user!.id, taskId);
	setFlash(cookies, `${task.name} deleted`);
	redirect(303, '/tasks');
}
