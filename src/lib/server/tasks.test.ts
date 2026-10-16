import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { addDays, todayInZone } from '$lib/time';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-tasks-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { equipment, events } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment } = await import('./specs');
const { createEvent, createTest } = await import('./logs');
const { completeTask, createTask, getTask, undoCompletion } = await import('./tasks');

const user = upsertUser({ email: 'tasks@example.com', name: 'Keeper' });
const tz = user.timeZone;
const today = todayInZone(tz);
const tank = createTank(user, { name: 'Tasks tank', type: 'planted', nominalVolumeL: 100 });

const newTask = (name: string, kind: 'water_change' | 'test' | 'maintenance' | 'other', extra: { equipmentId?: string } = {}) =>
	createTask(user.id, tank.id, { name, kind, recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false, ...extra });
const entriesOf = (taskId: string) => db.select().from(events).where(eq(events.tankId, tank.id)).all().filter((e) => e.data.task_id === taskId);

describe('Done leaves an entry in History (#161)', () => {
	it('logs a maintenance task as a Maintenance entry, and Undo takes it out', () => {
		const task = newTask('Clean glass', 'maintenance');
		const done = completeTask(user.id, task.id, { timeZone: tz });
		const [entry] = entriesOf(task.id);
		expect(entry).toMatchObject({ id: done.eventId, category: 'maintenance', note: null, data: { actions: ['Clean glass'], task_done: true } });
		undoCompletion(user.id, done.completionId);
		expect(entriesOf(task.id)).toHaveLength(0);
		expect(getTask(user.id, task.id).nextDue).toBe(today);
	});

	it("marks an item's service task's item serviced, and Undo puts the date back", () => {
		const filter = addEquipment(user.id, tank.id, { type: 'filter', brand: 'Tidewell', model: 'C-400', specs: {}, installedAt: null, notes: null }, tz);
		db.update(equipment).set({ lastServicedAt: '2026-01-02T10:00:00.000Z' }).where(eq(equipment.id, filter.id)).run();
		const task = newTask('Clean canister', 'maintenance', { equipmentId: filter.id });
		const done = completeTask(user.id, task.id, { at: '2026-03-04T10:00:00.000Z', timeZone: tz });
		expect(entriesOf(task.id)[0].data).toMatchObject({ actions: ['Clean canister'], equipment_id: filter.id });
		expect(db.select().from(equipment).where(eq(equipment.id, filter.id)).get()?.lastServicedAt).toBe('2026-03-04T10:00:00.000Z');
		undoCompletion(user.id, done.completionId);
		expect(db.select().from(equipment).where(eq(equipment.id, filter.id)).get()?.lastServicedAt).toBe('2026-01-02T10:00:00.000Z');
		expect(entriesOf(task.id)).toHaveLength(0);
	});

	it('logs any other task as a "Done: …" note, dated when it was done', () => {
		for (const kind of ['water_change', 'test', 'other'] as const) {
			const task = newTask(`A ${kind} task`, kind);
			completeTask(user.id, task.id, { at: '2026-03-04T10:00:00.000Z', timeZone: tz });
			expect(entriesOf(task.id)).toEqual([
				expect.objectContaining({ category: 'note', note: `Done: A ${kind} task`, occurredAt: '2026-03-04T10:00:00.000Z', data: expect.objectContaining({ system: 'task_done' }) })
			]);
		}
	});

	it('logs nothing more when the work was logged from a form', () => {
		const wc = newTask('Water change 25%', 'water_change');
		const { event } = createEvent(user.id, tank.id, { category: 'water_change', occurredAt: new Date().toISOString(), note: null, data: { percent: 25 } }, { completeTaskId: wc.id, timeZone: tz });
		expect(entriesOf(wc.id)).toHaveLength(0);
		expect(db.select().from(events).where(eq(events.id, event.id)).get()).toBeDefined();

		const test = newTask('Test water', 'test');
		createTest(user.id, tank.id, { takenAt: new Date().toISOString(), note: null, readings: new Map() }, { completeTaskId: test.id, timeZone: tz });
		expect(entriesOf(test.id)).toHaveLength(0);
		expect(getTask(user.id, test.id).nextDue).toBe(addDays(today, 7));
	});

	it("Undo of a form's completion leaves the form's entry in History", () => {
		const wc = newTask('Water change 30%', 'water_change');
		const { event } = createEvent(user.id, tank.id, { category: 'water_change', occurredAt: new Date().toISOString(), note: null, data: { percent: 30 } }, { completeTaskId: wc.id, timeZone: tz });
		const completion = db.$client.prepare('select id from task_completions where task_id = ?').get(wc.id) as { id: string };
		undoCompletion(user.id, completion.id);
		expect(db.select().from(events).where(eq(events.id, event.id)).get()).toBeDefined();
	});
});
