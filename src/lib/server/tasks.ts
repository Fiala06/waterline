import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { addDays, dateInZone, fmtDate, todayInZone } from '$lib/time';
import { amountText, courseDayText, effectiveDue, intervalText, isRoutine, logCompletes, nextDueAfterCompletion, reminderSub, resumeSchedule, skipTo } from '$lib/tasks';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { equipment, events, taskCompletions, tanks, tasks, tests, users, type Tank, type Task } from './db/schema';
import { getTank } from './tanks';

/** The user's today, for whether a task is paused (#172). */
function userToday(userId: string) {
	const u = db.select({ tz: users.timeZone }).from(users).where(eq(users.id, userId)).get();
	return todayInZone(u?.tz ?? 'UTC');
}

/**
 * Open tasks (with a due date) across the user's active tanks, soonest first.
 * A paused one (#172) is left out, unless `paused` asks for it (Tasks lists it apart).
 */
export function listTasks(userId: string, tankId?: string, opts: { paused?: boolean } = {}) {
	const today = userToday(userId);
	return db
		.select({ task: tasks, tankName: tanks.name })
		.from(tasks)
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(
			and(
				visibleTo(userId),
				isNull(tanks.archivedAt),
				isNotNull(tasks.nextDue),
				tankId ? eq(tasks.tankId, tankId) : undefined
			)
		)
		.all()
		.map((r) => ({ ...r, task: { ...r.task, due: effectiveDue(r.task)!, paused: isPaused(r.task, today) } }))
		.filter((r) => opts.paused || !r.task.paused)
		.sort((a, b) => a.task.due.localeCompare(b.task.due) || a.task.name.localeCompare(b.task.name));
}

/** Paused (#172) until a day still to come. */
export const isPaused = (task: Pick<Task, 'pausedUntil'>, today: string) => !!task.pausedUntil && task.pausedUntil > today;

export function getTask(userId: string, taskId: string): Task {
	const row = db
		.select({ task: tasks })
		.from(tasks)
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(and(eq(tasks.id, taskId), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Task not found');
	return row.task;
}

/** What a routine's Done logs in History (#17): the dose, or the feeding. */
function routineEntry(task: Task) {
	const amount = task.amount != null ? { amount: task.amount } : {};
	if (task.kind === 'dosing') return { category: 'dosing' as const, data: { product: task.product ?? task.name, ...amount, unit: task.amountUnit ?? 'mL', task_id: task.id } };
	return { category: 'feeding' as const, data: { food: task.product ?? task.name, ...amount, ...(task.amountUnit ? { unit: task.amountUnit } : {}), task_id: task.id } };
}

/**
 * What any other task's Done logs in History (#161), when nothing else did: a
 * maintenance task is a Maintenance entry, the rest a "Done: …" note.
 */
function doneEntry(task: Task, prevServicedAt: string | null) {
	if (task.kind === 'maintenance') {
		const item = task.equipmentId ? { equipment_id: task.equipmentId, prev_serviced_at: prevServicedAt } : {};
		return { category: 'maintenance' as const, note: null, data: { actions: [task.name], ...item, task_id: task.id, task_done: true } };
	}
	return { category: 'note' as const, note: `Done: ${task.name}`, data: { system: 'task_done', task_id: task.id, task_done: true } };
}

/**
 * Mark a task done at `at` (ISO instant) and move it to its next occurrence.
 * The previous schedule is kept on the completion so it can be undone. Done
 * always leaves an entry in History, wherever it's marked (the Tasks page, the
 * dashboard, an email or a notification): a routine its dose or feeding, any
 * other task a Maintenance entry or a note, unless the work was logged already
 * (`eventId`, or `logged` for a water test, which isn't an entry).
 */
export function completeTask(userId: string, taskId: string, opts: { at?: string; eventId?: string; logged?: boolean; timeZone: string }) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'log');
	const at = opts.at ?? new Date().toISOString();
	const nextDue = nextDueAfterCompletion(task, dateInZone(at, opts.timeZone), todayInZone(opts.timeZone));
	// the last of a course: it's done, and History says so
	const finished = task.recurring && task.endsOn && !nextDue;
	const completion = db.transaction((tx) => {
		if (finished)
			tx.insert(events)
				.values({ tankId: task.tankId, occurredAt: at, category: 'note', note: `Finished: ${isRoutine(task.kind) ? `${task.product ?? task.name} course` : task.name}`, data: { system: 'course_finished', task_id: task.id } })
				.run();
		const logs = !opts.eventId && !opts.logged;
		// an item's service task: done is serviced, as when the service is logged
		const item = logs && task.kind === 'maintenance' && task.equipmentId ? tx.select().from(equipment).where(eq(equipment.id, task.equipmentId)).get() : undefined;
		if (item) tx.update(equipment).set({ lastServicedAt: at }).where(eq(equipment.id, item.id)).run();
		const logged = logs
			? tx
					.insert(events)
					.values({ tankId: task.tankId, occurredAt: at, ...(isRoutine(task.kind) ? { note: null, ...routineEntry(task) } : doneEntry(task, item?.lastServicedAt ?? null)) })
					.returning()
					.get()
			: null;
		const c = tx
			.insert(taskCompletions)
			.values({
				taskId,
				completedAt: at,
				eventId: opts.eventId ?? logged?.id ?? null,
				prevNextDue: task.nextDue,
				prevSnoozedUntil: task.snoozedUntil
			})
			.returning()
			.get();
		tx.update(tasks).set({ nextDue, snoozedUntil: null }).where(eq(tasks.id, taskId)).run();
		return c;
	});
	return { ...task, nextDue, completionId: completion.id, eventId: completion.eventId };
}

/** Undo the latest completion of a task, restoring its previous schedule. */
export function undoCompletion(userId: string, completionId: string) {
	const row = db
		.select({ c: taskCompletions, task: tasks })
		.from(taskCompletions)
		.innerJoin(tasks, eq(tasks.id, taskCompletions.taskId))
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(and(eq(taskCompletions.id, completionId), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Nothing to undo');
	requireRoleOn(userId, row.task.tankId, 'log');
	const latest = db
		.select()
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, row.task.id))
		.orderBy(desc(taskCompletions.completedAt), desc(taskCompletions.id))
		.get();
	if (latest?.id !== completionId) error(409, 'Only the latest completion can be undone');
	db.transaction((tx) => {
		tx.update(tasks)
			.set({ nextDue: row.c.prevNextDue, snoozedUntil: row.c.prevSnoozedUntil })
			.where(eq(tasks.id, row.task.id))
			.run();
		tx.delete(taskCompletions).where(eq(taskCompletions.id, completionId)).run();
		// a skip (#71): its "Skipped" note leaves History
		if (row.c.skipped && row.c.eventId) tx.delete(events).where(eq(events.id, row.c.eventId)).run();
		// the course isn't over after all
		if (row.task.endsOn && !row.task.nextDue)
			tx.delete(events).where(and(eq(events.tankId, row.task.tankId), eq(events.category, 'note'), sql`json_extract(${events.data}, '$.system') = 'course_finished' AND json_extract(${events.data}, '$.task_id') = ${row.task.id}`)).run();
		// a routine's dose or feeding was logged by Done: undoing takes it back out of History
		// (a dose logged by hand that completed it (#167) stays: it has no task_id)
		if (isRoutine(row.task.kind) && row.c.eventId)
			tx.delete(events).where(and(eq(events.id, row.c.eventId), sql`json_extract(${events.data}, '$.task_id') = ${row.task.id}`)).run();
		// and so was any other task's entry (#161), but never one logged from a form
		if (!isRoutine(row.task.kind) && !row.c.skipped && row.c.eventId) {
			const entry = tx.select().from(events).where(eq(events.id, row.c.eventId)).get();
			if (entry?.data.task_done === true) {
				if (typeof entry.data.equipment_id === 'string')
					tx.update(equipment).set({ lastServicedAt: (entry.data.prev_serviced_at as string | null) ?? null }).where(eq(equipment.id, entry.data.equipment_id)).run();
				tx.delete(events).where(eq(events.id, entry.id)).run();
			}
		}
		// a setup review (#30): its History entry goes, and the parts it checked are as they were
		if (row.task.kind === 'review' && row.c.eventId) {
			const entry = tx.select().from(events).where(eq(events.id, row.c.eventId)).get();
			if (entry?.data.system === 'setup_reviewed') {
				tx.update(tanks).set({ reviewChecks: (entry.data.prev_checks ?? {}) as Tank['reviewChecks'] }).where(eq(tanks.id, entry.tankId)).run();
				tx.delete(events).where(eq(events.id, entry.id)).run();
			}
		}
	});
	return row.task;
}

/**
 * Skip this one (#71): the occurrence due is passed over, not done. The task
 * moves to its next date after today, History gets a "Skipped" note, and a
 * skipped completion keeps the schedule before it so Undo can restore it.
 */
export function skipTask(userId: string, taskId: string, opts: { timeZone: string }) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'log');
	const today = todayInZone(opts.timeZone);
	const nextDue = skipTo(task, today);
	if (!nextDue) error(400, 'This task has no next one to skip to');
	const at = new Date().toISOString();
	const completion = db.transaction((tx) => {
		const note = tx
			.insert(events)
			.values({
				tankId: task.tankId,
				occurredAt: at,
				category: 'note',
				note: `Skipped: ${task.name}`,
				data: { system: 'task_skipped', task_id: task.id, due: effectiveDue(task) }
			})
			.returning()
			.get();
		const c = tx
			.insert(taskCompletions)
			.values({ taskId, completedAt: at, eventId: note.id, prevNextDue: task.nextDue, prevSnoozedUntil: task.snoozedUntil, skipped: true })
			.returning()
			.get();
		tx.update(tasks).set({ nextDue, snoozedUntil: null }).where(eq(tasks.id, taskId)).run();
		return c;
	});
	return { ...task, nextDue, completionId: completion.id };
}

/** Snooze moves only the current occurrence; the schedule after it stays the same. */
export function snoozeTask(userId: string, taskId: string, until: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'log');
	if (!task.nextDue) return task;
	// back on its own date: nothing moved
	return db.update(tasks).set({ snoozedUntil: until === task.nextDue ? null : until }).where(eq(tasks.id, taskId)).returning().get();
}

/** The day a task was last done (not skipped), in the keeper's time zone. */
export function lastDoneOn(taskId: string, timeZone: string): string | null {
	const c = db
		.select({ at: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(and(eq(taskCompletions.taskId, taskId), eq(taskCompletions.skipped, false)))
		.orderBy(desc(taskCompletions.completedAt))
		.get();
	return c ? dateInZone(c.at, timeZone) : null;
}

/**
 * A water change or test already logged that is this task's occurrence (#163),
 * so Skip can offer to count it instead: the tank's latest of that kind.
 */
export function countableEntry(task: Task, timeZone: string): { kind: 'event' | 'test'; id: string; at: string; date: string } | null {
	if (task.kind !== 'water_change' && task.kind !== 'test') return null;
	const latest =
		task.kind === 'test'
			? db.select({ id: tests.id, at: tests.takenAt }).from(tests).where(eq(tests.tankId, task.tankId)).orderBy(desc(tests.takenAt)).get()
			: db
					.select({ id: events.id, at: events.occurredAt })
					.from(events)
					.where(and(eq(events.tankId, task.tankId), eq(events.category, 'water_change')))
					.orderBy(desc(events.occurredAt))
					.get();
	if (!latest) return null;
	const date = dateInZone(latest.at, timeZone);
	if (date > todayInZone(timeZone) || !logCompletes(task, lastDoneOn(task.id, timeZone), date)) return null;
	return { kind: task.kind === 'test' ? 'test' : 'event', id: latest.id, at: latest.at, date };
}

/** The last few times a task was done or skipped (#164), newest first, each with its History entry. */
export function recentCompletions(taskId: string, timeZone: string, limit = 5) {
	return db
		// the entry, when it's still in History
		.select({ id: taskCompletions.id, at: taskCompletions.completedAt, skipped: taskCompletions.skipped, eventId: events.id })
		.from(taskCompletions)
		.leftJoin(events, eq(events.id, taskCompletions.eventId))
		.where(eq(taskCompletions.taskId, taskId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(limit)
		.all()
		.map((c) => ({ ...c, date: dateInZone(c.at, timeZone) }));
}

/**
 * A tank's open dosing routines, for a dose logged by hand to complete the one
 * for its product (#167): the form ticks it as it does a water change's (#163).
 */
export function dosingRoutines(userId: string, tankId: string, timeZone: string) {
	const today = todayInZone(timeZone);
	return listTasks(userId, tankId)
		.filter((r) => r.task.kind === 'dosing')
		.map(({ task }) => {
			const schedule = { recurring: task.recurring, intervalDays: task.intervalDays, scheduleMode: task.scheduleMode, nextDue: task.nextDue, snoozedUntil: task.snoozedUntil, weekdays: task.weekdays, endsOn: task.endsOn };
			return {
				id: task.id,
				product: task.product ?? task.name,
				label: `Also mark the reminder “${task.name}” done`,
				sub: reminderSub(schedule, today, today),
				schedule,
				lastDone: lastDoneOn(task.id, timeZone),
				today
			};
		});
}

/** The last dose of a routine's product logged on its tank (#167): "last 2 pumps · Oct 14". */
export function lastDoseText(task: Pick<Task, 'tankId' | 'product' | 'name'>, timeZone: string): string | null {
	const product = (task.product ?? task.name).trim().toLowerCase();
	const e = db
		.select({ at: events.occurredAt, data: events.data })
		.from(events)
		.where(and(eq(events.tankId, task.tankId), eq(events.category, 'dosing'), sql`lower(trim(json_extract(${events.data}, '$.product'))) = ${product}`))
		.orderBy(desc(events.occurredAt))
		.get();
	if (!e) return null;
	const amount = amountText(typeof e.data.amount === 'number' ? e.data.amount : null, typeof e.data.unit === 'string' ? e.data.unit : null);
	return `last ${amount ? `${amount} · ` : ''}${fmtDate(dateInZone(e.at, timeZone))}`;
}

/** First open task of a kind for a tank, e.g. the water-change reminder. */
export function taskOfKind(userId: string, tankId: string, kind: Task['kind']) {
	getTank(userId, tankId);
	return listTasks(userId, tankId).find((r) => r.task.kind === kind)?.task;
}

export type TaskInput = Pick<Task, 'name' | 'kind' | 'recurring' | 'intervalDays' | 'scheduleMode' | 'nextDue' | 'openFormOnDone'> &
	Partial<Pick<Task, 'equipmentId' | 'weekdays' | 'product' | 'amount' | 'amountUnit' | 'endsOn' | 'fromEventId'>>;

export function createTask(userId: string, tankId: string, input: TaskInput) {
	getTank(userId, tankId, 'owner');
	return db.insert(tasks).values({ ...input, tankId }).returning().get();
}

export function updateTask(userId: string, taskId: string, input: TaskInput & { tankId: string }) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'owner');
	getTank(userId, input.tankId, 'owner');
	// The form shows the snoozed date as "Next due". Left as shown, the schedule and
	// snooze stay; a new date replaces both.
	const same = input.nextDue === effectiveDue(task);
	const schedule = same ? { nextDue: task.nextDue, snoozedUntil: task.snoozedUntil } : { snoozedUntil: null };
	return db.update(tasks).set({ ...input, ...schedule }).where(eq(tasks.id, taskId)).returning().get();
}

export function deleteTask(userId: string, taskId: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'owner');
	db.delete(tasks).where(eq(tasks.id, taskId)).run();
	return task;
}


// ── For a while (#171) and paused (#172) ────────────────────────────────────

/** A note in a tank's History from the app (not editable): a pause, a resume, a cadence for a while. */
function systemNote(tankId: string, note: string, data: Record<string, unknown>) {
	return db.insert(events).values({ tankId, occurredAt: new Date().toISOString(), category: 'note', note, data }).returning().get();
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Pause tasks until a day (#172): not due and not notified meanwhile. Each
 * tank gets one History note; it's returned so Undo can take it back out.
 */
export function pauseTasks(userId: string, taskIds: string[], until: string, timeZone: string) {
	const today = todayInZone(timeZone);
	if (until <= today) error(400, `Pick a day after ${fmtDate(today)}`);
	const list = taskIds.map((id) => getTask(userId, id));
	for (const t of list) requireRoleOn(userId, t.tankId, 'log');
	const notes = db.transaction(() => {
		for (const t of list) db.update(tasks).set({ pausedFrom: today, pausedUntil: until }).where(eq(tasks.id, t.id)).run();
		return [...Map.groupBy(list, (t) => t.tankId)].map(([tankId, ts]) =>
			systemNote(tankId, ts.length === 1 ? `Paused ${ts[0].name} until ${fmtDate(until)}` : `Paused ${plural(ts.length, 'task')} until ${fmtDate(until)}`, {
				system: 'tasks_paused',
				task_ids: ts.map((t) => t.id),
				until
			})
		);
	});
	return { tasks: list, noteIds: notes.map((n) => n.id) };
}

/** Undo a pause: as it was, its notes out of History. */
export function unpauseTasks(userId: string, noteIds: string[]) {
	for (const id of noteIds) {
		const note = db.select().from(events).where(and(eq(events.id, id), sql`json_extract(${events.data}, '$.system') = 'tasks_paused'`)).get();
		if (!note) continue;
		requireRoleOn(userId, note.tankId, 'log');
		const ids = (note.data.task_ids as string[] | undefined) ?? [];
		db.transaction(() => {
			for (const t of ids) db.update(tasks).set({ pausedFrom: null, pausedUntil: null }).where(and(eq(tasks.id, t), eq(tasks.tankId, note.tankId))).run();
			db.delete(events).where(eq(events.id, note.id)).run();
		});
	}
}

/**
 * Resume paused tasks on `resumeOn` (the day the pause ends, or today when
 * resumed early): their dates move on by the days paused (`resumeSchedule`),
 * and each tank's History says so.
 */
function resumeTasks(list: Task[], resumeOn: string) {
	if (!list.length) return;
	db.transaction(() => {
		for (const t of list) {
			const at = resumeSchedule(t, t.pausedFrom ?? resumeOn, resumeOn);
			db.update(tasks).set({ ...at, pausedFrom: null, pausedUntil: null }).where(eq(tasks.id, t.id)).run();
		}
		for (const [tankId, ts] of Map.groupBy(list, (t) => t.tankId))
			systemNote(tankId, ts.length === 1 ? `Resumed ${ts[0].name}` : `Resumed ${plural(ts.length, 'task')}`, { system: 'tasks_resumed', task_ids: ts.map((t) => t.id) });
	});
}

/** Resume now, before the pause was up. */
export function resumeTask(userId: string, taskId: string, timeZone: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'log');
	if (task.pausedUntil) resumeTasks([task], todayInZone(timeZone));
	return task;
}

/**
 * Bring the user's tasks up to today (run when the app loads and by the
 * scheduler): pauses that are up resume, on the day they ended, and a cadence
 * for a while that has run its time goes back to the usual one, saying so in History.
 */
export function settleTasks(userId: string, timeZone: string) {
	const today = todayInZone(timeZone);
	const mine = db
		.select({ task: tasks })
		.from(tasks)
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(and(visibleTo(userId), sql`(${tasks.pausedUntil} <= ${today} or ${tasks.tempUntil} <= ${today})`))
		.all()
		.map((r) => r.task);
	const ended = mine.filter((t) => t.pausedUntil && t.pausedUntil <= today);
	for (const [until, ts] of Map.groupBy(ended, (t) => t.pausedUntil!)) resumeTasks(ts, until);
	for (const t of mine.filter((t) => t.tempUntil && t.tempUntil <= today)) endTempCadence(t);
}

/** Back to the usual cadence (#171), with a note in History. */
function endTempCadence(task: Task, early = false) {
	db.transaction(() => {
		db.update(tasks).set({ tempIntervalDays: null, tempUntil: null }).where(eq(tasks.id, task.id)).run();
		systemNote(task.tankId, `${task.name}: back to ${intervalText({ ...task, endsOn: null })}${early ? ' (ended early)' : ''}`, { system: 'cadence_back', task_id: task.id });
	});
}

/**
 * A cadence for a while set, changed or ended on the task form (#171): the
 * change goes in History, and starting one brings the next date in when the
 * tighter cadence counts sooner from the last time it was done.
 */
export function setTempCadence(userId: string, taskId: string, temp: { intervalDays: number; until: string } | null, timeZone: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'owner');
	const today = todayInZone(timeZone);
	const was = task.tempIntervalDays && task.tempUntil ? { intervalDays: task.tempIntervalDays, until: task.tempUntil } : null;
	if (!temp) {
		if (was) endTempCadence(task, was.until > today);
		return;
	}
	if (was && was.intervalDays === temp.intervalDays && was.until === temp.until) return;
	const every = intervalText({ recurring: true, intervalDays: temp.intervalDays });
	db.transaction(() => {
		const set: Partial<Task> = { tempIntervalDays: temp.intervalDays, tempUntil: temp.until };
		// sooner from the last time it was done, never before today
		const last = lastDoneOn(task.id, timeZone);
		if (!was && task.scheduleMode === 'completion' && task.nextDue && last) {
			const sooner = addDays(last, temp.intervalDays);
			const at = sooner > today ? sooner : today;
			if (at < (effectiveDue(task) ?? at)) Object.assign(set, { nextDue: at, snoozedUntil: null });
		}
		db.update(tasks).set(set).where(eq(tasks.id, task.id)).run();
		systemNote(task.tankId, `${task.name}: ${every} until ${fmtDate(temp.until)}${was ? '' : `, then ${intervalText({ ...task, endsOn: null })}`}`, {
			system: 'cadence_temp',
			task_id: task.id,
			interval_days: temp.intervalDays,
			until: temp.until
		});
	});
}


// ── Courses (#174) ─────────────────────────────────────────────────────────

/** A course's "Day 3 of 14", counted from the day it was made; none for a task with no end. */
export function courseDay(task: Pick<Task, 'endsOn' | 'nextDue' | 'createdAt'>, timeZone: string): string | null {
	if (!task.endsOn || !task.nextDue) return null;
	return courseDayText(dateInZone(task.createdAt, timeZone), task.endsOn, todayInZone(timeZone));
}

/** End a course before its last day: nothing more is due, and History says so. Returns the note, for Undo. */
export function endCourseEarly(userId: string, taskId: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'log');
	if (!task.endsOn || !task.nextDue) error(400, 'This task is not a course');
	return db.transaction((tx) => {
		tx.update(tasks).set({ nextDue: null, snoozedUntil: null }).where(eq(tasks.id, task.id)).run();
		return tx
			.insert(events)
			.values({
				tankId: task.tankId,
				occurredAt: new Date().toISOString(),
				category: 'note',
				note: `Finished early: ${isRoutine(task.kind) ? `${task.product ?? task.name} course` : task.name}`,
				data: { system: 'course_finished', task_id: task.id, early: true, prev_next_due: task.nextDue, prev_snoozed_until: task.snoozedUntil }
			})
			.returning()
			.get();
	});
}

/** Undo ending a course early: due again where it was, the note out of History. */
export function reopenCourse(userId: string, noteId: string) {
	const note = db.select().from(events).where(eq(events.id, noteId)).get();
	if (!note || note.data.system !== 'course_finished' || note.data.early !== true) error(404, 'Nothing to undo');
	requireRoleOn(userId, note.tankId, 'log');
	const task = getTask(userId, String(note.data.task_id));
	db.transaction((tx) => {
		tx.update(tasks)
			.set({ nextDue: (note.data.prev_next_due as string) ?? null, snoozedUntil: (note.data.prev_snoozed_until as string | null) ?? null })
			.where(eq(tasks.id, task.id))
			.run();
		tx.delete(events).where(eq(events.id, note.id)).run();
	});
	return task;
}

/** The courses started from an entry (#174), for the entry's page. */
export function coursesFrom(eventId: string) {
	return db.select().from(tasks).where(eq(tasks.fromEventId, eventId)).all();
}

/** The algae an entry logged, for a course started from it (#174). */
export function algaeOf(eventId: string | null): string | null {
	if (!eventId) return null;
	const e = db.select({ data: events.data }).from(events).where(eq(events.id, eventId)).get();
	return e?.data.kind === 'algae' && typeof e.data.algae === 'string' ? e.data.algae : null;
}

/** Done on its own (#176): the setup review is done on its page, and a water change or test that opens its form. */
export const needsOwnDone = (task: Pick<Task, 'kind' | 'openFormOnDone'>) =>
	task.kind === 'review' || (task.openFormOnDone && (task.kind === 'water_change' || task.kind === 'test'));
