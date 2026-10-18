import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { addDays, fmtDate, todayInZone } from '$lib/time';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-tasks-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { equipment, events, tankParameters, tasks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment } = await import('./specs');
const { createEvent, createTest } = await import('./logs');
const { completableTask } = await import('./log-forms');
const { algaeOf, completeTask, updateTask, countableEntry, courseDay, coursesFrom, createTask, dosingRoutines, endCourseEarly, reopenCourse, getTask, lastDoneOn, lastDoseText, listTasks, pauseTasks, recentCompletions, resumeTask, setTempCadence, settleTasks, skipTask, undoCompletion, unpauseTasks } = await import('./tasks');

const await_follow = await import('./tasks');

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

describe('treatment courses (#174)', () => {
	const t = createTank(user, { name: 'Course tank', type: 'planted', nominalVolumeL: 60 });
	it('remembers the algae entry it came from, ends early with a note, and Undo reopens it', () => {
		const { event } = createEvent(user.id, t.id, { category: 'observation', occurredAt: new Date().toISOString(), note: null, data: { kind: 'algae', algae: 'Hair / thread', severity: 'moderate', tags: ['Algae'] } }, { timeZone: tz });
		const course = createTask(user.id, t.id, {
			name: 'Treat hair / thread algae',
			kind: 'maintenance',
			recurring: true,
			intervalDays: 2,
			scheduleMode: 'completion',
			nextDue: today,
			endsOn: addDays(today, 14),
			fromEventId: event.id,
			openFormOnDone: false
		});
		expect(coursesFrom(event.id).map((c) => c.id)).toEqual([course.id]);
		expect(algaeOf(course.fromEventId)).toBe('Hair / thread');
		expect(courseDay(course, tz)).toBe('Day 1 of 15');

		const note = endCourseEarly(user.id, course.id);
		expect(getTask(user.id, course.id).nextDue).toBeNull();
		expect(note.note).toBe('Finished early: Treat hair / thread algae');
		reopenCourse(user.id, note.id);
		expect(getTask(user.id, course.id).nextDue).toBe(today);
		expect(db.select().from(events).where(eq(events.id, note.id)).get()).toBeUndefined();
	});
});

describe('a fixed task\'s next date moved (#173)', () => {
	const t = createTank(user, { name: 'Fixed tank', type: 'planted', nominalVolumeL: 60 });
	const base = (nextDue: string) => ({ name: 'Water change', kind: 'water_change' as const, recurring: true, intervalDays: 7, scheduleMode: 'fixed' as const, nextDue, openFormOnDone: false, tankId: t.id });
	it('Just this one keeps the schedule; From now on moves it', () => {
		const sat = addDays(today, 5);
		const thu = addDays(today, 3);
		const a = createTask(user.id, t.id, base(sat));
		updateTask(user.id, a.id, base(thu), { moveOne: thu, picked: thu });
		expect(getTask(user.id, a.id)).toMatchObject({ nextDue: sat, snoozedUntil: thu });
		// saved again as shown: still moved
		updateTask(user.id, a.id, base(thu), { picked: thu });
		expect(getTask(user.id, a.id)).toMatchObject({ nextDue: sat, snoozedUntil: thu });
		// done on Thursday: the next one is on the schedule, a week after Saturday
		completeTask(user.id, a.id, { timeZone: tz });
		expect(getTask(user.id, a.id).nextDue).toBe(addDays(sat, 7));

		const b = createTask(user.id, t.id, base(sat));
		updateTask(user.id, b.id, base(thu), { picked: thu });
		expect(getTask(user.id, b.id)).toMatchObject({ nextDue: thu, snoozedUntil: null });
	});
});

describe('tasks that follow another log (#178)', () => {
	const { followSchedule, waitingTasks } = await_follow;
	const pond = createTank(user, { name: 'Follow tank', type: 'planted', nominalVolumeL: 60 });
	const follower = (name: string, triggerKind: 'water_change' | 'dosing' | 'maintenance' | 'test', triggerOffsetDays = 1, extra: Record<string, unknown> = {}) =>
		createTask(user.id, pond.id, { name, kind: 'other', recurring: true, intervalDays: null, scheduleMode: 'after', nextDue: null, openFormOnDone: false, triggerKind, triggerOffsetDays, ...extra });
	const log = (category: 'water_change' | 'dosing' | 'maintenance', daysAgo = 0, data: Record<string, unknown> = {}, completeTaskId?: string) =>
		createEvent(user.id, pond.id, { category, occurredAt: `${addDays(today, -daysAgo)}T12:00:00.000Z`, note: null, data }, { completeTaskId, timeZone: tz }).event;
	const due = (id: string) => getTask(user.id, id).nextDue;
	const at = (daysAgo: number) => `${addDays(today, -daysAgo)}T12:00:00.000Z`;

	it('waits with no date until the log it follows, then is due its day plus the offset', () => {
		const macros = follower('Dose macros', 'water_change', 1);
		expect(due(macros.id)).toBeNull();
		expect(waitingTasks(user.id, pond.id).map((r) => r.task.id)).toContain(macros.id);
		expect(listTasks(user.id, pond.id).map((r) => r.task.id)).not.toContain(macros.id);
		log('water_change');
		expect(due(macros.id)).toBe(addDays(today, 1));
		expect(waitingTasks(user.id, pond.id).map((r) => r.task.id)).not.toContain(macros.id);
	});

	it('counts a back-dated log from its own day, and an older one never moves a later date', () => {
		const glass = follower('Scrape glass', 'maintenance', 1);
		log('maintenance', 3);
		expect(due(glass.id)).toBe(addDays(today, -2));
		log('maintenance', 1);
		expect(due(glass.id)).toBe(today);
		log('maintenance', 5);
		expect(due(glass.id)).toBe(today);
	});

	it('done, it waits for the next log; one from before it was done leaves it waiting', () => {
		const micros = follower('Dose micros', 'test', 1);
		createTest(user.id, pond.id, { takenAt: at(2), note: null, readings: new Map() }, { timeZone: tz });
		expect(due(micros.id)).toBe(addDays(today, -1));
		completeTask(user.id, micros.id, { timeZone: tz });
		expect(due(micros.id)).toBeNull();
		createTest(user.id, pond.id, { takenAt: at(3), note: null, readings: new Map() }, { timeZone: tz });
		expect(due(micros.id)).toBeNull();
		createTest(user.id, pond.id, { takenAt: new Date().toISOString(), note: null, readings: new Map() }, { timeZone: tz });
		expect(due(micros.id)).toBe(addDays(today, 1));
	});

	it("moves with its log's date while not done, and waits again when the log is deleted", async () => {
		const { updateEvent, deleteEvent } = await import('./logs');
		const rinse = follower('Rinse sponge', 'water_change', 2);
		const wc = log('water_change');
		expect(due(rinse.id)).toBe(addDays(today, 2));
		updateEvent(user.id, wc.id, { occurredAt: at(1), note: null, data: {} });
		expect(due(rinse.id)).toBe(addDays(today, 1));
		deleteEvent(user.id, wc.id);
		expect(due(rinse.id)).toBeNull();
	});

	it('follows a dose of its product only, or any dose; a routine’s Done counts as the dose', () => {
		const thrive = follower('After Thrive', 'dosing', 1, { triggerProduct: 'Thrive S' });
		const any = follower('After any dose', 'dosing', 2);
		log('dosing', 0, { product: 'Excel' });
		expect(due(thrive.id)).toBeNull();
		expect(due(any.id)).toBe(addDays(today, 2));
		const routine = createTask(user.id, pond.id, { name: 'Dose Thrive S', kind: 'dosing', product: 'thrive s', amount: 2, amountUnit: 'mL', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		completeTask(user.id, routine.id, { timeZone: tz });
		expect(due(thrive.id)).toBe(addDays(today, 1));
	});

	it("never triggers itself, and a follower's own log triggers nothing (chains stop after one step)", () => {
		const first = createTask(user.id, pond.id, { name: 'Clean filter', kind: 'maintenance', recurring: true, intervalDays: null, scheduleMode: 'after', nextDue: null, openFormOnDone: false, triggerKind: 'water_change', triggerOffsetDays: 1 });
		const second = follower('After maintenance', 'maintenance', 1);
		log('water_change');
		expect(due(first.id)).toBe(addDays(today, 1));
		const before = due(second.id);
		completeTask(user.id, first.id, { timeZone: tz });
		expect(due(second.id)).toBe(before);
		// logged from the form, completing it: the same
		const again = createTask(user.id, pond.id, { name: 'Trim stems', kind: 'maintenance', recurring: true, intervalDays: null, scheduleMode: 'after', nextDue: today, openFormOnDone: false, triggerKind: 'maintenance', triggerOffsetDays: 3 });
		log('maintenance', 0, { actions: ['Trim stems'] }, again.id);
		expect(due(again.id)).toBeNull();
		expect(due(second.id)).toBe(before);
	});

	it('Undo of the Done that logged the water change puts its followers back to waiting', () => {
		const wcTask = createTask(user.id, pond.id, { name: 'Water change', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		const ferts = follower('Ferts after water change', 'water_change', 3);
		const done = completeTask(user.id, wcTask.id, { timeZone: tz });
		expect(due(ferts.id)).toBe(addDays(today, 3));
		undoCompletion(user.id, done.completionId);
		expect(due(ferts.id)).toBeNull();
	});

	it('not on water-change day: due the day one is logged, it moves to the next day, the schedule kept', () => {
		const filter = createTask(user.id, pond.id, { name: 'Clean canister', kind: 'maintenance', recurring: true, intervalDays: 14, scheduleMode: 'fixed', nextDue: today, openFormOnDone: false, avoidWaterChange: true });
		const other = createTask(user.id, pond.id, { name: 'Wipe lid', kind: 'maintenance', recurring: true, intervalDays: 14, scheduleMode: 'fixed', nextDue: today, openFormOnDone: false });
		log('water_change', 1);
		expect(getTask(user.id, filter.id).snoozedUntil).toBeNull();
		log('water_change');
		expect(getTask(user.id, filter.id)).toMatchObject({ nextDue: today, snoozedUntil: addDays(today, 1) });
		expect(getTask(user.id, other.id).snoozedUntil).toBeNull();
	});

	it('starts from the latest such log when that day is still to come, else waits', () => {
		const p2 = createTank(user, { name: 'Start tank', type: 'planted', nominalVolumeL: 40 });
		const input = { tankId: p2.id, triggerKind: 'water_change' as const, triggerProduct: null };
		expect(followSchedule({ ...input, triggerOffsetDays: 1 }, tz)).toEqual({ nextDue: null, triggerEntryId: null });
		const wc = createEvent(user.id, p2.id, { category: 'water_change', occurredAt: at(1), note: null, data: {} }, { timeZone: tz }).event;
		expect(followSchedule({ ...input, triggerOffsetDays: 1 }, tz)).toEqual({ nextDue: today, triggerEntryId: wc.id });
		expect(followSchedule({ ...input, triggerOffsetDays: 0 }, tz)).toEqual({ nextDue: null, triggerEntryId: null });
	});
});

describe('until a reading clears (#179)', () => {
	const tankC = createTank(user, { name: 'Clear tank', type: 'planted', nominalVolumeL: 60 });
	const params = db.select().from(tankParameters).where(eq(tankParameters.tankId, tankC.id)).all();
	const nh3 = params.find((p) => p.key === 'nh3')!;
	const test = (value: number, at = new Date().toISOString()) => createTest(user.id, tankC.id, { takenAt: at, note: null, readings: new Map([[nh3.id, value]]) }, { timeZone: tz });
	const notes = () => db.select().from(events).where(eq(events.tankId, tankC.id)).all().map((e) => e.note);
	const task = (name: string) => createTask(user.id, tankC.id, { name, kind: 'other', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: addDays(today, 1), openFormOnDone: false });

	it('a pause until ammonia reads 0 ends with the test that reads it, saying why', () => {
		const ferts = task('Dose ferts');
		pauseTasks(user.id, [ferts.id], addDays(today, 30), tz, nh3.id);
		expect(getTask(user.id, ferts.id)).toMatchObject({ pausedUntil: addDays(today, 30), pausedUntilParam: nh3.id });
		expect(notes()).toContain(`Paused Dose ferts until ammonia reads 0, ${fmtDate(addDays(today, 30))} at the latest`);
		test(0.5);
		expect(getTask(user.id, ferts.id).pausedUntil).toBe(addDays(today, 30));
		test(0);
		expect(getTask(user.id, ferts.id)).toMatchObject({ pausedUntil: null, pausedUntilParam: null });
		expect(notes()).toContain('Resumed Dose ferts: ammonia reads 0');
	});

	it('a test from before the pause began leaves it paused', () => {
		const feed = task('Feed');
		pauseTasks(user.id, [feed.id], addDays(today, 10), tz, nh3.id);
		test(0, `${addDays(today, -3)}T12:00:00.000Z`);
		expect(getTask(user.id, feed.id).pausedUntilParam).toBe(nh3.id);
	});

	it('a cadence for a while until ammonia reads 0 goes back to the usual when it does', () => {
		const wc = task('Water change');
		setTempCadence(user.id, wc.id, { intervalDays: 2, until: addDays(today, 14), untilParamId: nh3.id }, tz);
		expect(getTask(user.id, wc.id)).toMatchObject({ tempIntervalDays: 2, tempUntilParam: nh3.id });
		expect(notes()).toContain(`Water change: every 2 days until ammonia reads 0 (${fmtDate(addDays(today, 14))} at the latest), then every 7 days`);
		// saved again from its form, the reading it waits on stays
		setTempCadence(user.id, wc.id, { intervalDays: 2, until: addDays(today, 14) }, tz);
		expect(getTask(user.id, wc.id).tempUntilParam).toBe(nh3.id);
		test(0);
		expect(getTask(user.id, wc.id)).toMatchObject({ tempIntervalDays: null, tempUntil: null, tempUntilParam: null });
		expect(notes()).toContain('Water change: back to every 7 days: ammonia reads 0');
	});
});

describe('suggested steps for a tank (#179)', async () => {
	const { tankSuggestions, setSuggestion } = await import('./suggestions');
	const { getTank } = await import('./tanks');
	const old = createTank(user, { name: 'Old tank', type: 'planted', nominalVolumeL: 60, startDate: '2025-01-01' });
	const params = db.select().from(tankParameters).where(eq(tankParameters.tankId, old.id)).all();
	const nh3 = params.find((p) => p.key === 'nh3')!;
	const no3 = params.find((p) => p.key === 'no3')!;

	it("suggests the new tank's own water change for ammonia once it's past cycling", () => {
		const [s] = tankSuggestions(user, getTank(user.id, old.id), new Map([[nh3.id, 0.5]]));
		expect(s).toMatchObject({ rule: 'water_change_until_clear', action: { every: 2 } });
		expect(getTask(user.id, (s as { action: { taskId: string } }).action.taskId).name).toBe('Water change 25%');
		// a tank started this month may still be cycling: nothing yet
		const fresh = createTank(user, { name: 'Fresh tank', type: 'planted', nominalVolumeL: 60 });
		const freshNh3 = db.select().from(tankParameters).where(eq(tankParameters.tankId, fresh.id)).all().find((p) => p.key === 'nh3')!;
		expect(tankSuggestions(user, getTank(user.id, fresh.id), new Map([[freshNh3.id, 0.5]]))).toEqual([]);
	});

	it('nitrate at 0 suggests nothing, even in a dosed tank', () => {
		createTask(user.id, old.id, { name: 'Dose Prime', kind: 'dosing', product: 'Seachem Prime', amount: 2, amountUnit: 'mL', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		expect(tankSuggestions(user, getTank(user.id, old.id), new Map([[no3.id, 0]]))).toEqual([]);
	});

	it('switched off for the tank, and back on', () => {
		const ammonia = new Map([[nh3.id, 0.5]]);
		setSuggestion(old.id, 'water_change_until_clear', false);
		expect(tankSuggestions(user, getTank(user.id, old.id), ammonia)).toEqual([]);
		setSuggestion(old.id, 'water_change_until_clear', true);
		expect(tankSuggestions(user, getTank(user.id, old.id), ammonia)).toHaveLength(1);
	});
});
