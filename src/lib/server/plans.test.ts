import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { addDays, todayInZone } from '$lib/time';
import { planTemplate } from '$lib/plans';

const dir = mkdtempSync(join(tmpdir(), 'wl-plans-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, planRuns, tasks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createTask, getTask, listTasks, settleTasks } = await import('./tasks');
const { endPlanEarly, extendPlan, getPlanRun, listPlanRuns, planSteps, startPlan } = await import('./plans');

const user = upsertUser({ email: 'plans@example.com', name: 'Keeper' });
const tz = user.timeZone;
const today = todayInZone(tz);
const notes = (tankId: string, system: string) => db.select().from(events).where(eq(events.tankId, tankId)).all().filter((e) => e.data.system === system);

describe('treatment plans (#177)', () => {
	it('start a blackout: its steps as tasks on their days, ferts held back, noted in History', () => {
		const tank = createTank(user, { name: 'Plan tank', type: 'planted', nominalVolumeL: 60 });
		const ferts = createTask(user.id, tank.id, { name: 'Dose Thrive', kind: 'dosing', product: 'Thrive', recurring: true, intervalDays: 1, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		const t = planTemplate('blackout')!;
		const run = startPlan(user, tank.id, { template: t.key, name: t.name, steps: t.steps, pauseIds: [ferts.id], pauseDays: 4 });
		expect(run).toMatchObject({ startedOn: today, endsOn: addDays(today, 18) });
		const steps = planSteps(run.id);
		expect(steps).toHaveLength(4);
		expect(steps[0]).toMatchObject({ nextDue: today, endsOn: addDays(today, 3), intervalDays: 1, scheduleMode: 'fixed' });
		expect(steps[1]).toMatchObject({ kind: 'water_change', nextDue: addDays(today, 4), recurring: false });
		// the ferts are held back for four days, and out of what's due
		expect(getTask(user.id, ferts.id).pausedUntil).toBe(addDays(today, 4));
		expect(listTasks(user.id, tank.id).map((r) => r.task.id)).not.toContain(ferts.id);
		expect(getPlanRun(user.id, run.id).pausedTaskIds).toEqual([ferts.id]);
		expect(notes(tank.id, 'plan_started')).toHaveLength(1);
		expect(listPlanRuns(user.id, tz, tank.id).running.map((r) => r.status)).toEqual(['Day 1 of 19']);

		// ended early: steps close, the ferts come back
		endPlanEarly(user, run.id);
		expect(planSteps(run.id).every((s) => s.nextDue === null)).toBe(true);
		expect(getTask(user.id, ferts.id).pausedUntil).toBeNull();
		expect(listPlanRuns(user.id, tz, tank.id).past.map((r) => r.status)).toEqual(['Ended early']);
	});

	it('extends the steps that ran to its end, and finishes after its last day', () => {
		const tank = createTank(user, { name: 'Spot tank', type: 'planted', nominalVolumeL: 60 });
		const t = planTemplate('spot')!;
		const run = startPlan(user, tank.id, { template: t.key, name: t.name, steps: t.steps, pauseIds: [], pauseDays: 0 });
		extendPlan(user, run.id, addDays(run.endsOn, 7));
		const [daily, wc] = planSteps(run.id);
		expect(daily.endsOn).toBe(addDays(today, 20));
		// the water change every 3 days, last on day 14, ran to the end too
		expect(wc.endsOn).toBe(addDays(today, 20));

		db.update(planRuns).set({ endsOn: addDays(today, -1) }).where(eq(planRuns.id, run.id)).run();
		settleTasks(user.id, tz);
		expect(getPlanRun(user.id, run.id).endedAt).not.toBeNull();
		expect(notes(tank.id, 'plan_ended').map((n) => n.note)).toEqual(['Finished plan: Spot treatment']);
	});

	it('only holds back the tank\'s own tasks', () => {
		const a = createTank(user, { name: 'A', type: 'planted', nominalVolumeL: 60 });
		const b = createTank(user, { name: 'B', type: 'planted', nominalVolumeL: 60 });
		const other = createTask(user.id, b.id, { name: 'Feed', kind: 'feeding', product: 'Flakes', recurring: true, intervalDays: 1, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		const t = planTemplate('blackout')!;
		startPlan(user, a.id, { template: t.key, name: t.name, steps: t.steps, pauseIds: [other.id], pauseDays: 4 });
		expect(db.select().from(tasks).where(eq(tasks.id, other.id)).get()?.pausedUntil).toBeNull();
	});
});
