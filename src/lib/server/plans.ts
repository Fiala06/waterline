// Treatment plans (#177): a plan run on a tank, its steps as ordinary tasks
// (tasks.plan_run_id) so Due, notifications, History and Done work as for any
// task, and the routines it holds back paused (#172) for its first days.
import { error } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { addDays, daysBetween, fmtDate, todayInZone } from '$lib/time';
import { planDays, stepDates, type PlanStep } from '$lib/plans';
import { courseDayText } from '$lib/tasks';
import { db } from './db';
import { requireRoleOn, visibleTo } from './members';
import { events, planRuns, tanks, tasks, type PlanRun, type User } from './db/schema';
import { getTank } from './tanks';
import { isPaused, listTasks, pauseTasks, resumeTask } from './tasks';

function note(tankId: string, text: string, data: Record<string, unknown>) {
	db.insert(events).values({ tankId, occurredAt: new Date().toISOString(), category: 'note', note: text, data }).run();
}

/**
 * Start a plan today: a task per step (fixed dates, ending on its last day),
 * the chosen routines paused for its first days, and a note in History.
 */
export function startPlan(
	user: User,
	tankId: string,
	plan: { template: string; name: string; steps: PlanStep[]; pauseIds: string[]; pauseDays: number; fromEventId?: string | null }
) {
	const tank = getTank(user.id, tankId, 'owner');
	const today = todayInZone(user.timeZone);
	const days = planDays(plan.steps);
	const endsOn = addDays(today, days - 1);
	const fromEventId = plan.fromEventId && db.select({ t: events.tankId }).from(events).where(eq(events.id, plan.fromEventId)).get()?.t === tank.id ? plan.fromEventId : null;
	const run = db.transaction((tx) => {
		const r = tx
			.insert(planRuns)
			.values({ tankId: tank.id, template: plan.template, name: plan.name, startedOn: today, endsOn, fromEventId })
			.returning()
			.get();
		for (const s of plan.steps) {
			const { first, last, times } = stepDates(s, today);
			tx.insert(tasks)
				.values({
					tankId: tank.id,
					name: s.name,
					kind: s.kind,
					recurring: times > 1,
					intervalDays: times > 1 ? s.every : null,
					scheduleMode: 'fixed',
					nextDue: first,
					endsOn: times > 1 ? last : null,
					openFormOnDone: false,
					planRunId: r.id
				})
				.run();
		}
		tx.insert(events)
			.values({
				tankId: tank.id,
				occurredAt: new Date().toISOString(),
				category: 'note',
				note: `Started plan: ${plan.name} · ${days} day${days === 1 ? '' : 's'}, to ${fmtDate(endsOn)}`,
				data: { system: 'plan_started', plan_run_id: r.id }
			})
			.run();
		return r;
	});
	// the routines it holds back: only the tank's own, not its own steps
	const mine = new Set(listTasks(user.id, tank.id).map((r) => r.task.id));
	const pauseIds = plan.pauseIds.filter((id) => mine.has(id));
	if (pauseIds.length && plan.pauseDays > 0) {
		pauseTasks(user.id, pauseIds, addDays(today, plan.pauseDays), user.timeZone);
		db.update(planRuns).set({ pausedTaskIds: pauseIds }).where(eq(planRuns.id, run.id)).run();
	}
	return run;
}

/** A plan run the user can see. */
export function getPlanRun(userId: string, id: string): PlanRun {
	const row = db
		.select({ run: planRuns })
		.from(planRuns)
		.innerJoin(tanks, eq(tanks.id, planRuns.tankId))
		.where(and(eq(planRuns.id, id), visibleTo(userId)))
		.get();
	if (!row) error(404, 'Plan not found');
	return row.run;
}

/** "Day 3 of 19", or how it ended. */
export function planStatus(run: PlanRun, today: string): string {
	if (run.endedAt) return run.endedEarly ? 'Ended early' : 'Finished';
	return courseDayText(run.startedOn, run.endsOn, today);
}

/** Plans running on the user's tanks (or one tank), soonest to end first; the past ones apart. */
export function listPlanRuns(userId: string, timeZone: string, tankId?: string) {
	const today = todayInZone(timeZone);
	const rows = db
		.select({ run: planRuns, tankName: tanks.name })
		.from(planRuns)
		.innerJoin(tanks, eq(tanks.id, planRuns.tankId))
		.where(and(visibleTo(userId), isNull(tanks.archivedAt), tankId ? eq(planRuns.tankId, tankId) : undefined))
		.orderBy(desc(planRuns.createdAt))
		.all()
		.map((r) => ({ ...r.run, tankName: r.tankName, status: planStatus(r.run, today) }));
	return {
		running: rows.filter((r) => !r.endedAt).sort((a, b) => a.endsOn.localeCompare(b.endsOn)),
		past: rows.filter((r) => r.endedAt)
	};
}

/** A plan's steps, each with where it stands. */
export function planSteps(runId: string) {
	return db.select().from(tasks).where(eq(tasks.planRunId, runId)).orderBy(tasks.createdAt).all();
}

/** End a plan before its last day: its steps close, what it paused resumes, and History says so. */
export function endPlanEarly(user: User, runId: string) {
	const run = getPlanRun(user.id, runId);
	requireRoleOn(user.id, run.tankId, 'log');
	if (run.endedAt) return run;
	const today = todayInZone(user.timeZone);
	db.transaction((tx) => {
		tx.update(tasks).set({ nextDue: null, snoozedUntil: null }).where(and(eq(tasks.planRunId, run.id), isNotNull(tasks.nextDue))).run();
		tx.update(planRuns).set({ endedAt: new Date().toISOString(), endedEarly: true }).where(eq(planRuns.id, run.id)).run();
	});
	for (const id of run.pausedTaskIds) {
		const t = db.select().from(tasks).where(eq(tasks.id, id)).get();
		if (t && isPaused(t, today)) resumeTask(user.id, id, user.timeZone);
	}
	note(run.tankId, `Ended plan early: ${run.name}, on day ${Math.max(1, daysBetween(run.startedOn, today) + 1)}`, { system: 'plan_ended', plan_run_id: run.id, early: true });
	return run;
}

/** Run a plan longer: the steps that went to its last day go to the new one. */
export function extendPlan(user: User, runId: string, endsOn: string) {
	const run = getPlanRun(user.id, runId);
	requireRoleOn(user.id, run.tankId, 'log');
	if (run.endedAt) error(400, 'This plan has ended');
	if (endsOn <= run.endsOn) error(400, `Pick a day after ${fmtDate(run.endsOn)}`);
	db.transaction((tx) => {
		for (const t of tx.select().from(tasks).where(eq(tasks.planRunId, run.id)).all()) {
			// a repeating step still going that ran to the plan's end (within its cadence) carries on
			const toTheEnd = t.recurring && t.nextDue && t.endsOn && t.intervalDays && daysBetween(t.endsOn, run.endsOn) < t.intervalDays;
			if (toTheEnd) tx.update(tasks).set({ endsOn }).where(eq(tasks.id, t.id)).run();
		}
		tx.update(planRuns).set({ endsOn }).where(eq(planRuns.id, run.id)).run();
	});
	note(run.tankId, `Extended plan: ${run.name}, to ${fmtDate(endsOn)}`, { system: 'plan_extended', plan_run_id: run.id, was: run.endsOn });
}
