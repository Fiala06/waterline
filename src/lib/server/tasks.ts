import { error } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { addDays, dateInZone, todayInZone } from '$lib/time';
import { nextDueAfterCompletion } from '$lib/tasks';
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
		.orderBy(asc(tasks.nextDue))
		.all();
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

/** Mark a task done at `at` (ISO instant) and move it to its next occurrence. */
export function completeTask(
	userId: string,
	taskId: string,
	opts: { at?: string; eventId?: string; timeZone: string }
) {
	const task = getTask(userId, taskId);
	const at = opts.at ?? new Date().toISOString();
	const nextDue = nextDueAfterCompletion(task, dateInZone(at, opts.timeZone), todayInZone(opts.timeZone));
	db.transaction((tx) => {
		tx.insert(taskCompletions)
			.values({ taskId, completedAt: at, eventId: opts.eventId ?? null })
			.run();
		tx.update(tasks).set({ nextDue, snoozedUntil: null }).where(eq(tasks.id, taskId)).run();
	});
	return { ...task, nextDue };
}

/** Snooze moves only the current occurrence. */
export function snoozeTask(userId: string, taskId: string, days: number) {
	const task = getTask(userId, taskId);
	if (!task.nextDue) return task;
	const until = addDays(task.nextDue, days);
	return db.update(tasks).set({ nextDue: until, snoozedUntil: until }).where(eq(tasks.id, taskId)).returning().get();
}

/** First open task of a kind for a tank, e.g. the water-change reminder. */
export function taskOfKind(userId: string, tankId: string, kind: Task['kind']) {
	getTank(userId, tankId);
	return db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, tankId), eq(tasks.kind, kind), isNotNull(tasks.nextDue)))
		.orderBy(asc(tasks.nextDue))
		.get();
}

export function createTask(
	userId: string,
	tankId: string,
	input: Pick<Task, 'name' | 'kind' | 'recurring' | 'intervalDays' | 'scheduleMode' | 'nextDue' | 'openFormOnDone'>
) {
	getTank(userId, tankId);
	return db.insert(tasks).values({ ...input, tankId }).returning().get();
}
