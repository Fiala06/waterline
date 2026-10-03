import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { addDays, dateInZone, todayInZone } from '$lib/time';
import { effectiveDue, isRoutine, nextDueAfterCompletion } from '$lib/tasks';
import { db } from './db';
import { events, taskCompletions, tanks, tasks, type Tank, type Task } from './db/schema';
import { getTank } from './tanks';

/** Open tasks (with a due date) across the user's active tanks, soonest first. */
export function listTasks(userId: string, tankId?: string) {
	return db
		.select({ task: tasks, tankName: tanks.name })
		.from(tasks)
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(
			and(
				eq(tanks.userId, userId),
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
		.where(and(eq(tasks.id, taskId), eq(tanks.userId, userId)))
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
 * Mark a task done at `at` (ISO instant) and move it to its next occurrence.
 * The previous schedule is kept on the completion so it can be undone. A
 * dosing or feeding routine also logs its entry, wherever it's marked done
 * (the Tasks page, the dashboard, an email or a notification).
 */
export function completeTask(userId: string, taskId: string, opts: { at?: string; eventId?: string; timeZone: string }) {
	const task = getTask(userId, taskId);
	const at = opts.at ?? new Date().toISOString();
	const nextDue = nextDueAfterCompletion(task, dateInZone(at, opts.timeZone), todayInZone(opts.timeZone));
	// the last of a course: it's done, and History says so
	const finished = task.recurring && task.endsOn && !nextDue;
	const completion = db.transaction((tx) => {
		if (finished)
			tx.insert(events)
				.values({ tankId: task.tankId, occurredAt: at, category: 'note', note: `Finished: ${isRoutine(task.kind) ? `${task.product ?? task.name} course` : task.name}`, data: { system: 'course_finished', task_id: task.id } })
				.run();
		const logged =
			!opts.eventId && isRoutine(task.kind)
				? tx.insert(events).values({ tankId: task.tankId, occurredAt: at, note: null, ...routineEntry(task) }).returning().get()
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
		.where(and(eq(taskCompletions.id, completionId), eq(tanks.userId, userId)))
		.get();
	if (!row) error(404, 'Nothing to undo');
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
		// the course isn't over after all
		if (row.task.endsOn && !row.task.nextDue)
			tx.delete(events).where(and(eq(events.tankId, row.task.tankId), eq(events.category, 'note'), sql`json_extract(${events.data}, '$.system') = 'course_finished' AND json_extract(${events.data}, '$.task_id') = ${row.task.id}`)).run();
		// a routine's dose or feeding was logged by Done: undoing takes it back out of History
		if (isRoutine(row.task.kind) && row.c.eventId) tx.delete(events).where(eq(events.id, row.c.eventId)).run();
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

/** Snooze moves only the current occurrence; the schedule after it stays the same. */
export function snoozeTask(userId: string, taskId: string, until: string) {
	const task = getTask(userId, taskId);
	if (!task.nextDue) return task;
	return db.update(tasks).set({ snoozedUntil: until }).where(eq(tasks.id, taskId)).returning().get();
}

/** First open task of a kind for a tank, e.g. the water-change reminder. */
export function taskOfKind(userId: string, tankId: string, kind: Task['kind']) {
	getTank(userId, tankId);
	return listTasks(userId, tankId).find((r) => r.task.kind === kind)?.task;
}

export type TaskInput = Pick<Task, 'name' | 'kind' | 'recurring' | 'intervalDays' | 'scheduleMode' | 'nextDue' | 'openFormOnDone'> &
	Partial<Pick<Task, 'equipmentId' | 'weekdays' | 'product' | 'amount' | 'amountUnit' | 'endsOn'>>;

export function createTask(userId: string, tankId: string, input: TaskInput) {
	getTank(userId, tankId);
	return db.insert(tasks).values({ ...input, tankId }).returning().get();
}

export function updateTask(userId: string, taskId: string, input: TaskInput & { tankId: string }) {
	const task = getTask(userId, taskId);
	getTank(userId, input.tankId);
	// The form shows the snoozed date as "Next due". Left as shown, the schedule and
	// snooze stay; a new date replaces both.
	const same = input.nextDue === effectiveDue(task);
	const schedule = same ? { nextDue: task.nextDue, snoozedUntil: task.snoozedUntil } : { snoozedUntil: null };
	return db.update(tasks).set({ ...input, ...schedule }).where(eq(tasks.id, taskId)).returning().get();
}

export function deleteTask(userId: string, taskId: string) {
	const task = getTask(userId, taskId);
	db.delete(tasks).where(eq(tasks.id, taskId)).run();
	return task;
}

