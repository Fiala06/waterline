import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { addDays, dateInZone, fmtDate, todayInZone } from '$lib/time';
import { amountText, courseDayText, effectiveDue, intervalText, isRoutine, logCompletes, nextDueAfterCompletion, reminderSub, resumeSchedule, skipTo, type TriggerKind } from '$lib/tasks';
import { clearText, readingClears } from '$lib/suggestions';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { equipment, events, planRuns, tankParameters, taskCompletions, tanks, tasks, tests, users, type Tank, type Task } from './db/schema';
import { getTank } from './tanks';

/** The user's time zone, for a change made without one at hand. */
export function userZone(userId: string) {
	return db.select({ tz: users.timeZone }).from(users).where(eq(users.id, userId)).get()?.tz ?? 'UTC';
}

/** The user's today, for whether a task is paused (#172). */
function userToday(userId: string) {
	return todayInZone(userZone(userId));
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
	// Done logged the work itself: the tasks that follow it are due from it (#178), never
	// from a follower's own Done (chains stop after one step)
	const kind = triggerKindOf(task.kind);
	if (kind && completion.eventId && !opts.eventId && !opts.logged && task.scheduleMode !== 'after')
		followLog(task.tankId, { kind, date: dateInZone(at, opts.timeZone), product: task.product, id: completion.eventId }, opts.timeZone, task.id);
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
	// the entry Done logged is gone: what followed it waits again (#178)
	if (row.c.eventId && !db.select({ id: events.id }).from(events).where(eq(events.id, row.c.eventId)).get()) unfollowEntry(row.c.eventId);
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
	Partial<
		Pick<
			Task,
			'equipmentId' | 'weekdays' | 'product' | 'amount' | 'amountUnit' | 'endsOn' | 'fromEventId' | 'graceDays' | 'snoozedUntil' | 'triggerKind' | 'triggerOffsetDays' | 'triggerProduct' | 'triggerEntryId' | 'avoidWaterChange'
		>
	>;

export function createTask(userId: string, tankId: string, input: TaskInput) {
	getTank(userId, tankId, 'owner');
	return db.insert(tasks).values({ ...input, tankId }).returning().get();
}

export function updateTask(userId: string, taskId: string, input: TaskInput & { tankId: string }, opts: { moveOne?: string | null; picked?: string } = {}) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'owner');
	getTank(userId, input.tankId, 'owner');
	// The form shows the snoozed date as "Next due". Left as shown, the schedule and
	// snooze stay; a new date replaces both, unless it's Just this one (#173): then
	// the schedule stays on next_due and only this occurrence moves.
	// (the date as picked: on set days the form moves it to the next of them)
	const same = (opts.picked ?? input.nextDue) === effectiveDue(task);
	// after a log (#178): the form worked its date out from the log
	const schedule =
		input.scheduleMode === 'after'
			? {}
			: same
				? { nextDue: task.nextDue, snoozedUntil: task.snoozedUntil }
				: opts.moveOne && task.nextDue
					? { nextDue: task.nextDue, snoozedUntil: opts.moveOne === task.nextDue ? null : opts.moveOne }
					: { snoozedUntil: null };
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
export function pauseTasks(userId: string, taskIds: string[], until: string, timeZone: string, untilParamId: string | null = null) {
	const today = todayInZone(timeZone);
	if (until <= today) error(400, `Pick a day after ${fmtDate(today)}`);
	const list = taskIds.map((id) => getTask(userId, id));
	for (const t of list) requireRoleOn(userId, t.tankId, 'log');
	// or sooner, until a reading clears (#179): a parameter of the tank's
	const param = untilParamId ? db.select().from(tankParameters).where(eq(tankParameters.id, untilParamId)).get() : undefined;
	const notes = db.transaction(() => {
		for (const t of list)
			db.update(tasks)
				.set({ pausedFrom: today, pausedUntil: until, pausedUntilParam: param?.tankId === t.tankId ? param.id : null })
				.where(eq(tasks.id, t.id))
				.run();
		return [...Map.groupBy(list, (t) => t.tankId)].map(([tankId, ts]) => {
			const what = ts.length === 1 ? ts[0].name : plural(ts.length, 'task');
			const when = param?.tankId === tankId ? `until ${clearText(param)}, ${fmtDate(until)} at the latest` : `until ${fmtDate(until)}`;
			return systemNote(tankId, `Paused ${what} ${when}`, { system: 'tasks_paused', task_ids: ts.map((t) => t.id), until });
		});
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
			for (const t of ids) db.update(tasks).set({ pausedFrom: null, pausedUntil: null, pausedUntilParam: null }).where(and(eq(tasks.id, t), eq(tasks.tankId, note.tankId))).run();
			db.delete(events).where(eq(events.id, note.id)).run();
		});
	}
}

/**
 * Resume paused tasks on `resumeOn` (the day the pause ends, or today when
 * resumed early): their dates move on by the days paused (`resumeSchedule`),
 * and each tank's History says so.
 */
function resumeTasks(list: Task[], resumeOn: string, why?: string) {
	if (!list.length) return;
	db.transaction(() => {
		for (const t of list) {
			const at = resumeSchedule(t, t.pausedFrom ?? resumeOn, resumeOn);
			db.update(tasks).set({ ...at, pausedFrom: null, pausedUntil: null, pausedUntilParam: null }).where(eq(tasks.id, t.id)).run();
		}
		// a reading that cleared it (#179) says why: "Resumed Dose ferts: ammonia reads 0"
		for (const [tankId, ts] of Map.groupBy(list, (t) => t.tankId))
			systemNote(tankId, `Resumed ${ts.length === 1 ? ts[0].name : plural(ts.length, 'task')}${why ? `: ${why}` : ''}`, { system: 'tasks_resumed', task_ids: ts.map((t) => t.id) });
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
	// plans past their last day (#177): finished, and History says so
	const done = db
		.select({ run: planRuns })
		.from(planRuns)
		.innerJoin(tanks, eq(tanks.id, planRuns.tankId))
		.where(and(visibleTo(userId), isNull(planRuns.endedAt), sql`${planRuns.endsOn} < ${today}`))
		.all();
	for (const { run } of done) {
		db.update(planRuns).set({ endedAt: new Date().toISOString() }).where(eq(planRuns.id, run.id)).run();
		systemNote(run.tankId, `Finished plan: ${run.name}`, { system: 'plan_ended', plan_run_id: run.id });
	}
	const ended = mine.filter((t) => t.pausedUntil && t.pausedUntil <= today);
	for (const [until, ts] of Map.groupBy(ended, (t) => t.pausedUntil!)) resumeTasks(ts, until);
	for (const t of mine.filter((t) => t.tempUntil && t.tempUntil <= today)) endTempCadence(t);
}

/** Back to the usual cadence (#171), with a note in History. */
function endTempCadence(task: Task, early = false, why?: string) {
	db.transaction(() => {
		db.update(tasks).set({ tempIntervalDays: null, tempUntil: null, tempUntilParam: null }).where(eq(tasks.id, task.id)).run();
		const reason = why ? `: ${why}` : early ? ' (ended early)' : '';
		systemNote(task.tankId, `${task.name}: back to ${intervalText({ ...task, endsOn: null })}${reason}`, { system: 'cadence_back', task_id: task.id });
	});
}

/**
 * A cadence for a while set, changed or ended on the task form (#171): the
 * change goes in History, and starting one brings the next date in when the
 * tighter cadence counts sooner from the last time it was done.
 */
export function setTempCadence(userId: string, taskId: string, temp: { intervalDays: number; until: string; untilParamId?: string | null } | null, timeZone: string) {
	const task = getTask(userId, taskId);
	requireRoleOn(userId, task.tankId, 'owner');
	const today = todayInZone(timeZone);
	const was = task.tempIntervalDays && task.tempUntil ? { intervalDays: task.tempIntervalDays, until: task.tempUntil } : null;
	if (!temp) {
		if (was) endTempCadence(task, was.until > today);
		return;
	}
	// or sooner, until a reading clears (#179); left out, it stays as it was
	const paramId = temp.untilParamId === undefined ? task.tempUntilParam : temp.untilParamId;
	const param = paramId ? db.select().from(tankParameters).where(and(eq(tankParameters.id, paramId), eq(tankParameters.tankId, task.tankId))).get() : undefined;
	if (was && was.intervalDays === temp.intervalDays && was.until === temp.until && (param?.id ?? null) === task.tempUntilParam) return;
	const every = intervalText({ recurring: true, intervalDays: temp.intervalDays });
	const until = param ? `until ${clearText(param)} (${fmtDate(temp.until)} at the latest)` : `until ${fmtDate(temp.until)}`;
	db.transaction(() => {
		const set: Partial<Task> = { tempIntervalDays: temp.intervalDays, tempUntil: temp.until, tempUntilParam: param?.id ?? null };
		// sooner from the last time it was done, never before today
		const last = lastDoneOn(task.id, timeZone);
		if (!was && task.scheduleMode === 'completion' && task.nextDue && last) {
			const sooner = addDays(last, temp.intervalDays);
			const at = sooner > today ? sooner : today;
			if (at < (effectiveDue(task) ?? at)) Object.assign(set, { nextDue: at, snoozedUntil: null });
		}
		db.update(tasks).set(set).where(eq(tasks.id, task.id)).run();
		systemNote(task.tankId, `${task.name}: ${every} ${until}${was ? '' : `, then ${intervalText({ ...task, endsOn: null })}`}`, {
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


// ── After a log (#178) ──────────────────────────────────────────────────────

/** A log a task can follow: its kind, its day, the product for a dose, and its entry. */
export interface FollowedLog {
	kind: TriggerKind;
	/** 'YYYY-MM-DD' in the keeper's time zone */
	date: string;
	product?: string | null;
	/** the event, or the test */
	id: string;
}

/** The kind of log a task's own Done is, for the tasks that follow one. */
function triggerKindOf(kind: Task['kind']): TriggerKind | null {
	return kind === 'water_change' || kind === 'dosing' || kind === 'maintenance' || kind === 'test' ? kind : null;
}

/** The kind of log an entry is (null for the rest): a water change, a dose of a product, maintenance. */
export function triggerOf(category: string, data: Record<string, unknown>): { kind: TriggerKind; product: string | null } | null {
	if (category === 'water_change' || category === 'maintenance') return { kind: category, product: null };
	if (category === 'dosing') return { kind: 'dosing', product: typeof data.product === 'string' ? data.product : null };
	return null;
}

const sameProduct = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A log on a tank: the tasks that follow its kind (a dose: of their product,
 * or any) are due its day plus their offset, unless they've been done since
 * or a later log counts already; a back-dated log counts from its own day.
 * And a task kept off water-change day that's due the day of a water change
 * moves to the next day. `exceptTaskId`: the task the log completed, never its own follower.
 */
export function followLog(tankId: string, log: FollowedLog, timeZone: string, exceptTaskId?: string | null) {
	const followers = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, tankId), eq(tasks.scheduleMode, 'after'), eq(tasks.triggerKind, log.kind)))
		.all();
	for (const t of followers) {
		if (t.id === exceptTaskId) continue;
		if (log.kind === 'dosing' && t.triggerProduct && !sameProduct(t.triggerProduct, log.product)) continue;
		const due = addDays(log.date, t.triggerOffsetDays ?? 0);
		const last = lastDoneOn(t.id, timeZone);
		if ((last && due <= last) || (t.nextDue && due < t.nextDue)) continue;
		db.update(tasks).set({ nextDue: due, snoozedUntil: null, triggerEntryId: log.id }).where(eq(tasks.id, t.id)).run();
	}
	if (log.kind !== 'water_change') return;
	const kept = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, tankId), eq(tasks.avoidWaterChange, true), isNotNull(tasks.nextDue)))
		.all();
	for (const t of kept) {
		if (t.id === exceptTaskId || effectiveDue(t) !== log.date || lastDoneOn(t.id, timeZone) === log.date) continue;
		db.update(tasks).set({ snoozedUntil: addDays(log.date, 1) }).where(eq(tasks.id, t.id)).run();
	}
}

/** A log's day changed: what it set the due date of moves with it, unless done since. */
export function refollowEntry(entryId: string, date: string) {
	const list = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.triggerEntryId, entryId), eq(tasks.scheduleMode, 'after'), isNotNull(tasks.nextDue)))
		.all();
	for (const t of list) db.update(tasks).set({ nextDue: addDays(date, t.triggerOffsetDays ?? 0), snoozedUntil: null }).where(eq(tasks.id, t.id)).run();
}

/** A log deleted: what it set the due date of waits for the next one again. */
export function unfollowEntry(entryId: string) {
	db.update(tasks)
		.set({ nextDue: null, snoozedUntil: null, triggerEntryId: null })
		.where(and(eq(tasks.triggerEntryId, entryId), eq(tasks.scheduleMode, 'after'), isNotNull(tasks.nextDue)))
		.run();
}

/** The tank's latest log of a kind (a dose: of a product, when it's for one). */
function latestLog(tankId: string, kind: TriggerKind, product: string | null): { id: string; at: string } | undefined {
	if (kind === 'test') return db.select({ id: tests.id, at: tests.takenAt }).from(tests).where(eq(tests.tankId, tankId)).orderBy(desc(tests.takenAt)).get();
	const ofProduct = kind === 'dosing' && product ? sql`lower(trim(json_extract(${events.data}, '$.product'))) = ${product.trim().toLowerCase()}` : undefined;
	return db
		.select({ id: events.id, at: events.occurredAt })
		.from(events)
		.where(and(eq(events.tankId, tankId), eq(events.category, kind), ofProduct))
		.orderBy(desc(events.occurredAt))
		.get();
}

/**
 * Where a task that follows a log starts, when it's made or what it follows
 * changes: due from the latest such log if that day is today or still to come,
 * else waiting for the next one. Done since that day, it waits too.
 */
export function followSchedule(
	task: { id?: string; tankId: string; triggerKind: TriggerKind; triggerOffsetDays: number; triggerProduct: string | null },
	timeZone: string
): { nextDue: string | null; triggerEntryId: string | null } {
	const log = latestLog(task.tankId, task.triggerKind, task.triggerKind === 'dosing' ? task.triggerProduct : null);
	if (!log) return { nextDue: null, triggerEntryId: null };
	const due = addDays(dateInZone(log.at, timeZone), task.triggerOffsetDays);
	const last = task.id ? lastDoneOn(task.id, timeZone) : null;
	if (due < todayInZone(timeZone) || (last && due <= last)) return { nextDue: null, triggerEntryId: null };
	return { nextDue: due, triggerEntryId: log.id };
}

/** Tasks that follow a log and wait for the next one (#178): on the user's tanks, or one tank. */
export function waitingTasks(userId: string, tankId?: string) {
	return db
		.select({ task: tasks, tankName: tanks.name })
		.from(tasks)
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(and(visibleTo(userId), isNull(tanks.archivedAt), eq(tasks.scheduleMode, 'after'), isNull(tasks.nextDue), tankId ? eq(tasks.tankId, tankId) : undefined))
		.orderBy(tasks.name)
		.all();
}


// ── Until a reading clears (#179) ───────────────────────────────────────────

/**
 * A test on a tank: a pause or a cadence for a while that lasts until a
 * parameter reads in range ends when this test reads it so (no longer ✕),
 * with why in History. A test from before the pause began doesn't count.
 */
export function clearByTest(tankId: string, readings: Map<string, number>, takenOn: string, timeZone: string) {
	const today = todayInZone(timeZone);
	const waiting = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.tankId, tankId), sql`(${tasks.pausedUntilParam} is not null or ${tasks.tempUntilParam} is not null)`))
		.all();
	if (!waiting.length) return;
	const params = new Map(db.select().from(tankParameters).where(eq(tankParameters.tankId, tankId)).all().map((p) => [p.id, p]));
	const cleared = (id: string | null) => {
		const p = id ? params.get(id) : undefined;
		const v = p ? readings.get(p.id) : undefined;
		return p && v != null && readingClears(p, v) ? clearText(p) : null;
	};
	for (const t of waiting) {
		const paused = cleared(t.pausedUntilParam);
		if (paused && isPaused(t, today) && takenOn >= (t.pausedFrom ?? takenOn)) resumeTasks([t], today, paused);
		const temp = cleared(t.tempUntilParam);
		if (temp && t.tempUntil && t.tempUntil > today) endTempCadence(t, true, temp);
	}
}
