import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { addDays, dateInZone, todayInZone } from '$lib/time';
import { effectiveDue, nextDueAfterCompletion } from '$lib/tasks';
import { db } from './db';
import { taskCompletions, tanks, tasks, type Task } from './db/schema';
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

/**
 * Mark a task done at `at` (ISO instant) and move it to its next occurrence.
 * The previous schedule is kept on the completion so it can be undone.
 */
export function completeTask(userId: string, taskId: string, opts: { at?: string; eventId?: string; timeZone: string }) {
	const task = getTask(userId, taskId);
	const at = opts.at ?? new Date().toISOString();
	const nextDue = nextDueAfterCompletion(task, dateInZone(at, opts.timeZone), todayInZone(opts.timeZone));
	const completion = db.transaction((tx) => {
		const c = tx
			.insert(taskCompletions)
			.values({
				taskId,
				completedAt: at,
				eventId: opts.eventId ?? null,
				prevNextDue: task.nextDue,
				prevSnoozedUntil: task.snoozedUntil
			})
			.returning()
			.get();
		tx.update(tasks).set({ nextDue, snoozedUntil: null }).where(eq(tasks.id, taskId)).run();
		return c;
	});
	return { ...task, nextDue, completionId: completion.id };
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

export type TaskInput = Pick<Task, 'name' | 'kind' | 'recurring' | 'intervalDays' | 'scheduleMode' | 'nextDue' | 'openFormOnDone'>;

export function createTask(userId: string, tankId: string, input: TaskInput) {
	getTank(userId, tankId);
	return db.insert(tasks).values({ ...input, tankId }).returning().get();
}

export function updateTask(userId: string, taskId: string, input: TaskInput & { tankId: string }) {
	const task = getTask(userId, taskId);
	getTank(userId, input.tankId);
	// A new due date replaces any snooze.
	const snoozedUntil = input.nextDue === task.nextDue ? task.snoozedUntil : null;
	return db.update(tasks).set({ ...input, snoozedUntil }).where(eq(tasks.id, taskId)).returning().get();
}

export function deleteTask(userId: string, taskId: string) {
	const task = getTask(userId, taskId);
	db.delete(tasks).where(eq(tasks.id, taskId)).run();
	return task;
}

