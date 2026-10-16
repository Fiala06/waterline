import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { addDays, dateInZone, todayInZone } from '$lib/time';
import { effectiveDue, isRoutine, logCompletes, nextDueAfterCompletion, skipTo } from '$lib/tasks';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { equipment, events, taskCompletions, tanks, tasks, tests, type Tank, type Task } from './db/schema';
import { getTank } from './tanks';

/** Open tasks (with a due date) across the user's active tanks, soonest first. */
export function listTasks(userId: string, tankId?: string) {
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
		.map((r) => ({ ...r, task: { ...r.task, due: effectiveDue(r.task)! } }))
		.sort((a, b) => a.task.due.localeCompare(b.task.due) || a.task.name.localeCompare(b.task.name));
}

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
		if (isRoutine(row.task.kind) && row.c.eventId) tx.delete(events).where(eq(events.id, row.c.eventId)).run();
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

/** First open task of a kind for a tank, e.g. the water-change reminder. */
export function taskOfKind(userId: string, tankId: string, kind: Task['kind']) {
	getTank(userId, tankId);
	return listTasks(userId, tankId).find((r) => r.task.kind === kind)?.task;
}

export type TaskInput = Pick<Task, 'name' | 'kind' | 'recurring' | 'intervalDays' | 'scheduleMode' | 'nextDue' | 'openFormOnDone'> &
	Partial<Pick<Task, 'equipmentId' | 'weekdays' | 'product' | 'amount' | 'amountUnit' | 'endsOn'>>;

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

