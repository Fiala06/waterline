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
const { equipment, events, tasks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment } = await import('./specs');
const { createEvent, createTest } = await import('./logs');
const { completableTask } = await import('./log-forms');
const { completeTask, countableEntry, createTask, dosingRoutines, getTask, lastDoneOn, lastDoseText, listTasks, pauseTasks, recentCompletions, resumeTask, setTempCadence, settleTasks, skipTask, undoCompletion, unpauseTasks } = await import('./tasks');

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

describe('a log done early completes its reminder (#163)', () => {
	const otherTank = createTank(user, { name: 'Early tank', type: 'planted', nominalVolumeL: 60 });
	const every3 = () =>
		createTask(user.id, otherTank.id, { name: 'Water change 50%', kind: 'water_change', recurring: true, intervalDays: 3, scheduleMode: 'completion', nextDue: addDays(today, 1), openFormOnDone: false });

	it('offers and ticks the reminder a day early, counting the next one from the entry', () => {
		const task = every3();
		const offer = completableTask(user, otherTank.id, 'water_change', null, today);
		expect(offer).toMatchObject({ id: task.id, checked: true });
		expect(offer?.sub).toMatch(/next would be/);
	});

	it('offers a reminder due later too, unticked', () => {
		const t = createTank(user, { name: 'Later tank', type: 'planted', nominalVolumeL: 60 });
		const task = createTask(user.id, t.id, { name: 'Water change 20%', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: addDays(today, 6), openFormOnDone: false });
		expect(completableTask(user, t.id, 'water_change', null, today)).toMatchObject({ id: task.id, checked: false });
		// opened by its Mark done: always ticked
		expect(completableTask(user, t.id, 'water_change', task.id, today)).toMatchObject({ checked: true });
	});

	it('lets Skip count a water change already logged', () => {
		const t = createTank(user, { name: 'Count tank', type: 'planted', nominalVolumeL: 60 });
		const task = createTask(user.id, t.id, { name: 'Water change 30%', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: addDays(today, 1), openFormOnDone: false });
		expect(countableEntry(task, tz)).toBeNull();
		const { event } = createEvent(user.id, t.id, { category: 'water_change', occurredAt: new Date().toISOString(), note: null, data: { percent: 30 } }, { timeZone: tz });
		expect(countableEntry(task, tz)).toMatchObject({ kind: 'event', id: event.id, date: today });
		completeTask(user.id, task.id, { at: event.occurredAt, eventId: event.id, timeZone: tz });
		// counted: it isn't offered again
		expect(countableEntry(getTask(user.id, task.id), tz)).toBeNull();
	});
});

describe('when a task was last done (#164)', () => {
	it('lists done and skipped, newest first, and last done leaves skips out', () => {
		const task = newTask('Dose iron', 'other');
		completeTask(user.id, task.id, { at: '2026-03-01T10:00:00.000Z', timeZone: tz });
		db.$client.prepare('update tasks set next_due = ? where id = ?').run(addDays(today, -1), task.id);
		skipTask(user.id, task.id, { timeZone: tz });
		const done = recentCompletions(task.id, tz);
		expect(done.map((c) => c.skipped)).toEqual([true, false]);
		expect(done.every((c) => c.eventId)).toBe(true);
		expect(lastDoneOn(task.id, tz)).toBe('2026-03-01');
	});
});

describe('a dose logged by hand (#167)', () => {
	it("is offered to its product's routine, completes it, and Undo leaves the dose in History", () => {
		const t = createTank(user, { name: 'Dose tank', type: 'planted', nominalVolumeL: 60 });
		const routine = createTask(user.id, t.id, { name: 'Thrive', kind: 'dosing', product: 'Thrive S', amount: 3, amountUnit: 'mL', recurring: true, intervalDays: 2, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		const [offer] = dosingRoutines(user.id, t.id, tz);
		expect(offer).toMatchObject({ id: routine.id, product: 'Thrive S' });
		expect(lastDoseText(routine, tz)).toBeNull();

		const { event } = createEvent(user.id, t.id, { category: 'dosing', occurredAt: new Date().toISOString(), note: null, data: { product: 'thrive s', amount: 2, unit: 'pumps' } }, { completeTaskId: routine.id, timeZone: tz });
		expect(getTask(user.id, routine.id).nextDue).toBe(addDays(today, 2));
		expect(lastDoseText(routine, tz)).toMatch(/^last 2 pumps · /);
		// one entry: the dose itself
		expect(db.select().from(events).where(eq(events.tankId, t.id)).all().filter((e) => e.category === 'dosing')).toHaveLength(1);

		const completion = db.$client.prepare('select id from task_completions where task_id = ?').get(routine.id) as { id: string };
		undoCompletion(user.id, completion.id);
		expect(db.select().from(events).where(eq(events.id, event.id)).get()).toBeDefined();
		expect(getTask(user.id, routine.id).nextDue).toBe(today);
	});
});

const notesOf = (tankId: string, system: string) => db.select().from(events).where(eq(events.tankId, tankId)).all().filter((e) => e.data.system === system);

describe('paused tasks (#172)', () => {
	const t = createTank(user, { name: 'Pause tank', type: 'planted', nominalVolumeL: 60 });
	const mk = (name: string, due: string) =>
		createTask(user.id, t.id, { name, kind: 'maintenance', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: due, openFormOnDone: false });

	it('are left out of what is due, noted once per tank, and Undo takes the pause back', () => {
		const a = mk('Dose ferts', today);
		const b = mk('Feed', addDays(today, 1));
		const { noteIds } = pauseTasks(user.id, [a.id, b.id], addDays(today, 4), tz);
		const shown = listTasks(user.id, t.id).map((r) => r.task.id);
		expect(shown).not.toContain(a.id);
		expect(listTasks(user.id, t.id, { paused: true }).find((r) => r.task.id === a.id)?.task.paused).toBe(true);
		expect(notesOf(t.id, 'tasks_paused')).toHaveLength(1);
		unpauseTasks(user.id, noteIds);
		expect(listTasks(user.id, t.id).map((r) => r.task.id)).toEqual(expect.arrayContaining([a.id, b.id]));
		expect(notesOf(t.id, 'tasks_paused')).toHaveLength(0);
	});

	it('resume on their day with their dates moved on, and History says so', () => {
		const c = mk('Clean glass', addDays(today, 1));
		pauseTasks(user.id, [c.id], addDays(today, 4), tz);
		// four days on: the pause is up
		db.update(tasks).set({ pausedFrom: addDays(today, -4), pausedUntil: today }).where(eq(tasks.id, c.id)).run();
		db.update(tasks).set({ nextDue: addDays(today, -3) }).where(eq(tasks.id, c.id)).run();
		settleTasks(user.id, tz);
		const after = getTask(user.id, c.id);
		expect(after).toMatchObject({ pausedUntil: null, pausedFrom: null, nextDue: addDays(today, 1) });
		expect(notesOf(t.id, 'tasks_resumed').map((n) => n.note)).toContain('Resumed Clean glass');
	});

	it('can be resumed early', () => {
		const d = mk('Trim', today);
		pauseTasks(user.id, [d.id], addDays(today, 5), tz);
		resumeTask(user.id, d.id, tz);
		expect(getTask(user.id, d.id)).toMatchObject({ pausedUntil: null, nextDue: today });
	});
});

describe('a cadence for a while (#171)', () => {
	const t = createTank(user, { name: 'Outbreak tank', type: 'planted', nominalVolumeL: 60 });
	it('starts sooner from the last time it was done, ends on its day, and History notes both', () => {
		const wc = createTask(user.id, t.id, { name: 'Water change 50%', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: addDays(today, 6), openFormOnDone: false });
		completeTask(user.id, wc.id, { at: new Date(Date.now() - 86_400_000).toISOString(), timeZone: tz });
		setTempCadence(user.id, wc.id, { intervalDays: 3, until: addDays(today, 14) }, tz);
		const during = getTask(user.id, wc.id);
		expect(during).toMatchObject({ tempIntervalDays: 3, tempUntil: addDays(today, 14), nextDue: addDays(today, 2) });
		expect(notesOf(t.id, 'cadence_temp')[0].note).toMatch(/^Water change 50%: every 3 days until .*, then every 7 days$/);

		// its day comes
		db.update(tasks).set({ tempUntil: today }).where(eq(tasks.id, wc.id)).run();
		settleTasks(user.id, tz);
		expect(getTask(user.id, wc.id)).toMatchObject({ tempIntervalDays: null, tempUntil: null });
		expect(notesOf(t.id, 'cadence_back')[0].note).toBe('Water change 50%: back to every 7 days');
	});

	it('ended early from the form says so', () => {
		const wc = createTask(user.id, t.id, { name: 'Brush algae', kind: 'maintenance', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		setTempCadence(user.id, wc.id, { intervalDays: 2, until: addDays(today, 10) }, tz);
		setTempCadence(user.id, wc.id, null, tz);
		expect(getTask(user.id, wc.id).tempIntervalDays).toBeNull();
		expect(notesOf(t.id, 'cadence_back').map((n) => n.note)).toContain('Brush algae: back to every 7 days (ended early)');
	});
});
