import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { visibleTo } from './members';
import { and, desc, eq } from 'drizzle-orm';
import { DOSING_UNITS } from '$lib/events';
import { effectiveDue, endsAfterTimes, FEED_UNITS, isRoutine, isTriggerKind, onOrAfterWeekday, parseWeekdays, TRIGGER_OFFSETS, type TriggerKind } from '$lib/tasks';
import { addDays, isDate, todayInZone } from '$lib/time';
import { db } from './db';
import { events, tanks, type Task, type User } from './db/schema';
import { listProducts } from './products';
import { setFlash } from './flash';
import { num, str } from './forms';
import { listTanks } from './tanks';
import { createTask, deleteTask, followSchedule, getTask, setTempCadence, updateTask, type TaskInput } from './tasks';

export type OnDone = 'none' | 'test' | 'water_change';
/** A task, or a routine (#17): Dosing and Feeding log their entry when done. */
export type TaskType = 'task' | 'dosing' | 'feeding';
/** Repeat every N days or weeks, on set days of the week, after a log (#178), or once. */
export type Repeat = 'every' | 'days' | 'after' | 'no';
/** A recurring task runs on, or ends: a course of doses stops on a date or after N times. */
export type Ends = 'never' | 'on' | 'times';

/** What a link can fill in on the new-task form: "Start a treatment course" from a health entry. */
export interface TaskPreset {
	/** a course's name, from the entry it's started from (#174) */
	name?: string | null;
	/** the algae or health entry a course is started from (#174) */
	entry?: string | null;
	product?: string | null;
	every?: string | null;
	/** 'YYYY-MM-DD' */
	ends?: string | null;
	amount?: string | null;
}

export const taskType = (v: string | null | undefined): TaskType => (v === 'dosing' || v === 'feeding' ? v : 'task');

/** Form values for a task (15 / D5). */
export function taskFormValues(task: Task | null, user: User, tankId: string | null, type: TaskType = 'task', preset: TaskPreset = {}) {
	if (!task) {
		const routine = type !== 'task';
		const every = preset.every && /^\d{1,3}$/.test(preset.every) && Number(preset.every) >= 1 ? preset.every : null;
		const ends = preset.ends && isDate(preset.ends) ? preset.ends : '';
		return {
			type,
			name: (preset.name ?? '').slice(0, 80),
			fromEvent: preset.entry && /^[\w-]{1,64}$/.test(preset.entry) ? preset.entry : '',
			tankId: tankId ?? listTanks(user.id, { own: true })[0]?.id ?? '',
			recurring: true,
			repeat: 'every' as Repeat,
			// a routine is most often daily; a task, weekly
			every: every ?? '1',
			unit: routine || every ? ('days' as const) : ('weeks' as const),
			weekdays: [] as number[],
			nextDue: todayInZone(user.timeZone),
			scheduleMode: 'completion' as 'completion' | 'fixed',
			onDone: 'none' as OnDone,
			product: (preset.product ?? '').slice(0, 80),
			amount: preset.amount && /^\d+([.,]\d+)?$/.test(preset.amount) ? preset.amount : '',
			amountUnit: type === 'dosing' ? 'mL' : '',
			ends: (ends ? 'on' : 'never') as Ends,
			endsOn: ends,
			endsTimes: '',
			tempOn: false,
			tempEvery: '',
			tempUntil: '',
			graceDays: '0',
			triggerKind: 'water_change' as TriggerKind,
			triggerOffset: '1',
			triggerProduct: '',
			avoidWaterChange: false,
			movedFrom: null as string | null,
			scheduled: null as string | null
		};
	}
	const d = task.intervalDays ?? 7;
	const weeks = d % 7 === 0;
	const days = task.scheduleMode === 'weekdays';
	const after = task.scheduleMode === 'after';
	return {
		type: taskType(task.kind),
		name: task.name,
		fromEvent: task.fromEventId ?? '',
		tankId: task.tankId,
		recurring: task.recurring,
		repeat: (!task.recurring ? 'no' : days ? 'days' : after ? 'after' : 'every') as Repeat,
		every: days ? '1' : String(weeks ? d / 7 : d),
		unit: days ? ('days' as const) : weeks ? ('weeks' as const) : ('days' as const),
		weekdays: parseWeekdays(task.weekdays),
		nextDue: effectiveDue(task) ?? todayInZone(user.timeZone),
		scheduleMode: (task.scheduleMode === 'fixed' ? 'fixed' : 'completion') as 'completion' | 'fixed',
		onDone: (task.openFormOnDone && (task.kind === 'test' || task.kind === 'water_change') ? task.kind : 'none') as OnDone,
		product: task.product ?? '',
		amount: task.amount != null ? String(task.amount) : '',
		amountUnit: task.amountUnit ?? '',
		ends: (task.endsOn ? 'on' : 'never') as Ends,
		endsOn: task.endsOn ?? '',
		endsTimes: '',
		tempOn: !!(task.tempIntervalDays && task.tempUntil),
		tempEvery: task.tempIntervalDays ? String(task.tempIntervalDays) : '',
		tempUntil: task.tempUntil ?? '',
		graceDays: String(task.graceDays ?? 0),
		triggerKind: (isTriggerKind(task.triggerKind) ? task.triggerKind : 'water_change') as TriggerKind,
		triggerOffset: String(task.triggerOffsetDays ?? 1),
		triggerProduct: task.triggerProduct ?? '',
		avoidWaterChange: task.avoidWaterChange,
		// moved on its own (#173): shown as "Moved from …", the schedule still on next_due
		movedFrom: task.snoozedUntil && task.nextDue && task.snoozedUntil !== task.nextDue ? task.nextDue : null,
		scheduled: effectiveDue(task)
	};
}

/** Products to pick from for a dosing routine: saved reorder links, then ones dosed before. */
export function routineProducts(userId: string): string[] {
	const dosed = db
		.select({ data: events.data })
		.from(events)
		.innerJoin(tanks, eq(tanks.id, events.tankId))
		.where(and(visibleTo(userId), eq(events.category, 'dosing')))
		.orderBy(desc(events.occurredAt))
		.limit(200)
		.all()
		.map((r) => (typeof r.data.product === 'string' ? r.data.product : ''));
	return [...new Set([...listProducts(userId).map((p) => p.name), ...dosed].map((p) => p.trim()).filter(Boolean))].slice(0, 30);
}

const repeatOf = (form: FormData): Repeat => {
	const r = str(form, 'recurring');
	return r === 'no' ? 'no' : r === 'days' ? 'days' : r === 'after' ? 'after' : 'every';
};
const endsOf = (form: FormData): Ends => {
	const e = str(form, 'ends');
	return e === 'on' ? 'on' : e === 'times' ? 'times' : 'never';
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
	// after a log (#178): its kind, the days after it, and a dose's product (any dose when blank)
	const triggerKind = str(form, 'triggerKind');
	const offset = num(form, 'triggerOffset');
	if (repeat === 'after' && !isTriggerKind(triggerKind)) errors.triggerKind = 'Pick what it follows.';
	if (repeat === 'after' && (offset == null || !TRIGGER_OFFSETS.includes(offset))) errors.triggerOffset = 'Pick how many days after.';
	let nextDue = str(form, 'nextDue');
	// it's due when the log is: the date is worked out on save
	if (repeat === 'after') nextDue = '';
	else if (!isDate(nextDue)) errors.nextDue = 'Pick a date.';
	// on set days: the first of them from the date picked
	else if (repeat === 'days' && days.length) nextDue = onOrAfterWeekday(nextDue, days);
	const onDone = routine ? 'none' : (str(form, 'onDone') as OnDone);

	// a course: until a date, or for N times (the date of the Nth from the next due)
	const ends = repeat === 'no' || repeat === 'after' ? 'never' : endsOf(form);
	let endsOn: string | null = null;
	if (ends === 'on') {
		endsOn = str(form, 'endsOn');
		if (!isDate(endsOn)) errors.endsOn = 'Pick the last day.';
		else if (isDate(nextDue) && endsOn < nextDue) errors.endsOn = 'The last day must be on or after the next due date.';
	} else if (ends === 'times') {
		const times = num(form, 'endsTimes');
		if (times == null || !Number.isInteger(times) || times < 1 || times > 365) errors.endsTimes = 'Enter how many times, 1 to 365.';
		else if (isDate(nextDue))
			endsOn = endsAfterTimes(
				{ recurring: true, intervalDays: repeat === 'every' ? (every ?? 1) * unit : null, scheduleMode: repeat === 'days' ? 'weekdays' : 'completion', weekdays: days.join(','), nextDue },
				times
			);
	}

	let kind: Task['kind'];
	if (routine) kind = type;
	else if (onDone === 'water_change' || onDone === 'test') kind = onDone;
	else if (existing) kind = existing.kind;
	else kind = /water change/i.test(name) ? 'water_change' : /\btest/i.test(name) ? 'test' : 'maintenance';

	const grace = num(form, 'graceDays');
	const input: TaskInput & { tankId: string } = {
		graceDays: grace != null && Number.isInteger(grace) && grace >= 0 && grace <= 3 ? grace : 0,
		name,
		tankId: str(form, 'tankId'),
		kind,
		recurring: repeat !== 'no',
		intervalDays: repeat === 'every' ? (every ?? 1) * unit : null,
		scheduleMode: repeat === 'days' ? 'weekdays' : repeat === 'after' ? 'after' : str(form, 'scheduleMode') === 'fixed' ? 'fixed' : 'completion',
		weekdays: repeat === 'days' ? days.join(',') : null,
		nextDue: nextDue || null,
		triggerKind: repeat === 'after' && isTriggerKind(triggerKind) ? triggerKind : null,
		triggerOffsetDays: repeat === 'after' ? (offset ?? 1) : null,
		triggerProduct: repeat === 'after' && triggerKind === 'dosing' ? str(form, 'triggerProduct').slice(0, 80) || null : null,
		// not on water-change day (#178): a task that repeats on its own
		avoidWaterChange: repeat !== 'after' && form.has('avoidWaterChange'),
		openFormOnDone: onDone !== 'none',
		product: routine ? product : null,
		amount: routine ? amount : null,
		amountUnit: routine
			? (type === 'dosing' ? (DOSING_UNITS.includes(amountUnit) ? amountUnit : 'mL') : FEED_UNITS.includes(amountUnit) ? amountUnit : null)
			: null,
		endsOn
	};
	// a course from an algae or health entry (#174): on a new task, kept on an edit
	if (!existing) input.fromEventId = entryOn(str(form, 'fromEvent'), input.tankId);
	// a fixed or set-days task's next date moved, Just this one (#173): the date as picked, the schedule kept
	const moveOne =
		!!existing &&
		str(form, 'moveScope') !== 'all' &&
		form.has('moveScope') &&
		existing.scheduleMode === input.scheduleMode &&
		(input.scheduleMode === 'fixed' || input.scheduleMode === 'weekdays') &&
		isDate(str(form, 'nextDue'));
	return { errors, input, moveOne: moveOne ? str(form, 'nextDue') : null, picked: str(form, 'nextDue') };
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
		amountUnit: str(form, 'amountUnit'),
		ends: endsOf(form),
		endsOn: str(form, 'endsOn'),
		endsTimes: str(form, 'endsTimes'),
		fromEvent: str(form, 'fromEvent'),
		tempOn: form.has('tempOn'),
		tempEvery: str(form, 'tempEvery'),
		tempUntil: str(form, 'tempUntil'),
		graceDays: str(form, 'graceDays') || '0',
		triggerKind: (isTriggerKind(str(form, 'triggerKind')) ? str(form, 'triggerKind') : 'water_change') as TriggerKind,
		triggerOffset: str(form, 'triggerOffset') || '1',
		triggerProduct: str(form, 'triggerProduct'),
		avoidWaterChange: form.has('avoidWaterChange'),
		movedFrom: null,
		scheduled: existing ? effectiveDue(existing) : null
	};
};

/** For a while (#171): every N days until a day to come, on a task that repeats every so often. */
function parseTemp(form: FormData, errors: Record<string, string>, today: string) {
	if (!form.has('tempOn') || repeatOf(form) !== 'every') return null;
	const every = num(form, 'tempEvery');
	const until = str(form, 'tempUntil');
	if (every == null || !Number.isInteger(every) || every < 1 || every > 365) errors.tempEvery = 'Enter how many days, 1 to 365.';
	if (!isDate(until) || until <= today) errors.tempUntil = 'Pick a day after today.';
	return errors.tempEvery || errors.tempUntil ? null : { intervalDays: every!, until };
}

/** The new-task form's query string: ?tank, ?type, ?from and what a link fills in. */
export function taskPreset(params: URLSearchParams): TaskPreset {
	return { name: params.get('name'), entry: params.get('entry'), product: params.get('product'), every: params.get('every'), ends: params.get('ends'), amount: params.get('amount') };
}

/** The entry a course comes from, when it's an entry of this tank; else none. */
function entryOn(id: string, tankId: string): string | null {
	if (!id) return null;
	const e = db.select({ tankId: events.tankId }).from(events).where(eq(events.id, id)).get();
	return e?.tankId === tankId ? id : null;
}

/** A treatment course from a health entry: a dose every other day for 10 days, from today. */
export function courseHref(tankId: string, product: string | null, today: string, from: string, entry?: string) {
	const q = new URLSearchParams({ tank: tankId, type: 'dosing', every: '2', ends: addDays(today, 10), from });
	if (product) q.set('product', product);
	if (entry) q.set('entry', entry);
	return `/tasks/new?${q}`;
}

/** A treatment course from an algae entry (#174): a task every other day for two weeks, from today. */
export function algaeCourseHref(tankId: string, algae: string, today: string, from: string, entry: string) {
	const q = new URLSearchParams({ tank: tankId, name: `Treat ${algae.toLowerCase()} algae`.slice(0, 80), every: '2', ends: addDays(today, 14), from, entry });
	return `/tasks/new?${q}`;
}

export async function saveTaskAction({ request, locals, cookies }: RequestEvent, taskId: string | null) {
	const user = locals.user!;
	const existing = taskId ? getTask(user.id, taskId) : null;
	const form = await request.formData();
	const { errors, input, moveOne, picked } = parse(form, existing);
	const temp = existing ? parseTemp(form, errors, todayInZone(user.timeZone)) : null;
	if (Object.keys(errors).length) return fail(400, { errors, values: formValues(form, existing) });
	if (input.scheduleMode === 'after') Object.assign(input, afterSchedule(existing, input, user.timeZone));
	else input.triggerEntryId = null;
	if (existing) {
		updateTask(user.id, existing.id, input, { moveOne, picked });
		setTempCadence(user.id, existing.id, temp, user.timeZone);
	} else createTask(user.id, input.tankId, input);
	setFlash(cookies, existing ? (isRoutine(input.kind) ? '✓ Routine saved' : '✓ Task saved') : `✓ ${input.name} added`);
	// a routine made from a tank's page goes back there
	redirect(303, isRoutine(input.kind) && !existing && str(form, 'from').startsWith('/tanks/') ? str(form, 'from') : '/tasks');
}

/**
 * A task that follows a log (#178): what it follows unchanged, it keeps its due
 * date (or its wait); new, or following something else, it's due from the
 * latest such log if that's still to come, else it waits for the next one.
 */
function afterSchedule(existing: Task | null, input: TaskInput & { tankId: string }, timeZone: string) {
	const same =
		existing?.scheduleMode === 'after' &&
		existing.tankId === input.tankId &&
		existing.triggerKind === input.triggerKind &&
		existing.triggerOffsetDays === input.triggerOffsetDays &&
		(existing.triggerProduct ?? '') === (input.triggerProduct ?? '');
	if (same) return { nextDue: existing.nextDue, snoozedUntil: existing.snoozedUntil, triggerEntryId: existing.triggerEntryId };
	const at = followSchedule({ id: existing?.id, tankId: input.tankId, triggerKind: input.triggerKind!, triggerOffsetDays: input.triggerOffsetDays ?? 0, triggerProduct: input.triggerProduct ?? null }, timeZone);
	return { ...at, snoozedUntil: null };
}

export function deleteTaskAction({ locals, cookies }: RequestEvent, taskId: string) {
	const task = deleteTask(locals.user!.id, taskId);
	setFlash(cookies, `${task.name} deleted`);
	redirect(303, '/tasks');
}
