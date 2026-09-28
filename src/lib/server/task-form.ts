import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { DOSING_UNITS } from '$lib/events';
import { FEED_UNITS, isRoutine, onOrAfterWeekday, parseWeekdays } from '$lib/tasks';
import { isDate, todayInZone } from '$lib/time';
import { db } from './db';
import { events, tanks, type Task, type User } from './db/schema';
import { listProducts } from './products';
import { setFlash } from './flash';
import { num, str } from './forms';
import { listTanks } from './tanks';
import { createTask, deleteTask, getTask, updateTask, type TaskInput } from './tasks';

export type OnDone = 'none' | 'test' | 'water_change';
/** A task, or a routine (#17): Dosing and Feeding log their entry when done. */
export type TaskType = 'task' | 'dosing' | 'feeding';
/** Repeat every N days or weeks, on set days of the week, or once. */
export type Repeat = 'every' | 'days' | 'no';

export const taskType = (v: string | null | undefined): TaskType => (v === 'dosing' || v === 'feeding' ? v : 'task');

/** Form values for a task (15 / D5). */
export function taskFormValues(task: Task | null, user: User, tankId: string | null, type: TaskType = 'task') {
	if (!task) {
		const routine = type !== 'task';
		return {
			type,
			name: '',
			tankId: tankId ?? listTanks(user.id)[0]?.id ?? '',
			recurring: true,
			repeat: 'every' as Repeat,
			// a routine is most often daily; a task, weekly
			every: '1',
			unit: routine ? ('days' as const) : ('weeks' as const),
			weekdays: [] as number[],
			nextDue: todayInZone(user.timeZone),
			scheduleMode: 'completion' as 'completion' | 'fixed',
			onDone: 'none' as OnDone,
			product: '',
			amount: '',
			amountUnit: type === 'dosing' ? 'mL' : ''
		};
	}
	const d = task.intervalDays ?? 7;
	const weeks = d % 7 === 0;
	const days = task.scheduleMode === 'weekdays';
	return {
		type: taskType(task.kind),
		name: task.name,
		tankId: task.tankId,
		recurring: task.recurring,
		repeat: (!task.recurring ? 'no' : days ? 'days' : 'every') as Repeat,
		every: days ? '1' : String(weeks ? d / 7 : d),
		unit: days ? ('days' as const) : weeks ? ('weeks' as const) : ('days' as const),
		weekdays: parseWeekdays(task.weekdays),
		nextDue: task.snoozedUntil && task.nextDue && task.snoozedUntil > task.nextDue ? task.snoozedUntil : (task.nextDue ?? todayInZone(user.timeZone)),
		scheduleMode: (task.scheduleMode === 'fixed' ? 'fixed' : 'completion') as 'completion' | 'fixed',
		onDone: (task.openFormOnDone && (task.kind === 'test' || task.kind === 'water_change') ? task.kind : 'none') as OnDone,
		product: task.product ?? '',
		amount: task.amount != null ? String(task.amount) : '',
		amountUnit: task.amountUnit ?? ''
	};
}

/** Products to pick from for a dosing routine: saved reorder links, then ones dosed before. */
export function routineProducts(userId: string): string[] {
	const dosed = db
		.select({ data: events.data })
		.from(events)
		.innerJoin(tanks, eq(tanks.id, events.tankId))
		.where(and(eq(tanks.userId, userId), eq(events.category, 'dosing')))
		.orderBy(desc(events.occurredAt))
		.limit(200)
		.all()
		.map((r) => (typeof r.data.product === 'string' ? r.data.product : ''));
	return [...new Set([...listProducts(userId).map((p) => p.name), ...dosed].map((p) => p.trim()).filter(Boolean))].slice(0, 30);
}

const repeatOf = (form: FormData): Repeat => {
	const r = str(form, 'recurring');
	return r === 'no' ? 'no' : r === 'days' ? 'days' : 'every';
};

function parse(form: FormData, existing: Task | null) {
	const errors: Record<string, string> = {};
	// a routine stays one; a new one is picked on the form
	const type: TaskType = existing ? taskType(existing.kind) : taskType(str(form, 'type'));
	const routine = type !== 'task';
	const product = str(form, 'product').slice(0, 80);
	const amount = num(form, 'amount');
	const amountUnit = str(form, 'amountUnit');
	if (routine) {
		if (!product) errors.product = type === 'dosing' ? 'Enter the product you dose.' : 'Enter the food.';
		if (amount != null && amount < 0) errors.amount = 'Enter an amount of 0 or more.';
	}
	const name = routine ? `${type === 'dosing' ? 'Dose' : 'Feed'} ${product}` : str(form, 'name').slice(0, 80);
	if (!routine && !name) errors.name = 'Give the task a name.';

	const repeat = repeatOf(form);
	const every = num(form, 'every');
	const unit = str(form, 'unit') === 'days' ? 1 : 7;
	if (repeat === 'every' && (every == null || every < 1 || !Number.isInteger(every) || every * unit > 3650))
		errors.every = 'Enter a whole number of days or weeks.';
	const days = parseWeekdays(form.getAll('weekday').map(String).join(','));
	if (repeat === 'days' && !days.length) errors.weekdays = 'Pick at least one day.';
	let nextDue = str(form, 'nextDue');
	if (!isDate(nextDue)) errors.nextDue = 'Pick a date.';
	// on set days: the first of them from the date picked
	else if (repeat === 'days' && days.length) nextDue = onOrAfterWeekday(nextDue, days);
	const onDone = routine ? 'none' : (str(form, 'onDone') as OnDone);

	let kind: Task['kind'];
	if (routine) kind = type;
	else if (onDone === 'water_change' || onDone === 'test') kind = onDone;
	else if (existing) kind = existing.kind;
	else kind = /water change/i.test(name) ? 'water_change' : /\btest/i.test(name) ? 'test' : 'maintenance';

	const input: TaskInput & { tankId: string } = {
		name,
		tankId: str(form, 'tankId'),
		kind,
		recurring: repeat !== 'no',
		intervalDays: repeat === 'every' ? (every ?? 1) * unit : null,
		scheduleMode: repeat === 'days' ? 'weekdays' : str(form, 'scheduleMode') === 'fixed' ? 'fixed' : 'completion',
		weekdays: repeat === 'days' ? days.join(',') : null,
		nextDue,
		openFormOnDone: onDone !== 'none',
		product: routine ? product : null,
		amount: routine ? amount : null,
		amountUnit: routine
			? (type === 'dosing' ? (DOSING_UNITS.includes(amountUnit) ? amountUnit : 'mL') : FEED_UNITS.includes(amountUnit) ? amountUnit : null)
			: null
	};
	return { errors, input };
}

const formValues = (form: FormData, existing: Task | null) => {
	const repeat = repeatOf(form);
	return {
		type: existing ? taskType(existing.kind) : taskType(str(form, 'type')),
		name: str(form, 'name'),
		tankId: str(form, 'tankId'),
		recurring: repeat !== 'no',
		repeat,
		every: str(form, 'every'),
		unit: (str(form, 'unit') === 'days' ? 'days' : 'weeks') as 'days' | 'weeks',
		weekdays: parseWeekdays(form.getAll('weekday').map(String).join(',')),
		nextDue: str(form, 'nextDue'),
		scheduleMode: (str(form, 'scheduleMode') === 'fixed' ? 'fixed' : 'completion') as 'completion' | 'fixed',
		onDone: str(form, 'onDone') as OnDone,
		product: str(form, 'product'),
		amount: str(form, 'amount'),
		amountUnit: str(form, 'amountUnit')
	};
};

export async function saveTaskAction({ request, locals, cookies }: RequestEvent, taskId: string | null) {
	const user = locals.user!;
	const existing = taskId ? getTask(user.id, taskId) : null;
	const form = await request.formData();
	const { errors, input } = parse(form, existing);
	if (Object.keys(errors).length) return fail(400, { errors, values: formValues(form, existing) });
	if (existing) updateTask(user.id, existing.id, input);
	else createTask(user.id, input.tankId, input);
	setFlash(cookies, existing ? (isRoutine(input.kind) ? '✓ Routine saved' : '✓ Task saved') : `✓ ${input.name} added`);
	// a routine made from a tank's page goes back there
	redirect(303, isRoutine(input.kind) && !existing && str(form, 'from').startsWith('/tanks/') ? str(form, 'from') : '/tasks');
}

export function deleteTaskAction({ locals, cookies }: RequestEvent, taskId: string) {
	const task = deleteTask(locals.user!.id, taskId);
	setFlash(cookies, `${task.name} deleted`);
	redirect(303, '/tasks');
}
