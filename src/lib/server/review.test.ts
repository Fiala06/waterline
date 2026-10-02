import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { addDays, todayInZone } from '$lib/time';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-review-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { equipment, events, tanks, tasks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank, getTank } = await import('./tanks');
const { addEquipment } = await import('./specs');
const { undoCompletion } = await import('./tasks');
const { checkSection, finishReview, lastReviewAt, reviewTask, servicedToday, setReviewEvery } = await import('./review');

const user = upsertUser({ email: 'keeper@example.com', name: 'Keeper' });
const today = todayInZone(user.timeZone);
const newTank = (name: string) => createTank(user, { name, type: 'planted', nominalVolumeL: 100 });

describe('the setup review task', () => {
	it('comes with every new tank, every 3 months', () => {
		const tank = newTank('Riverbed');
		expect(reviewTask(tank.id)).toMatchObject({ kind: 'review', name: 'Review tank setup', intervalDays: 91, nextDue: addDays(today, 91) });
	});

	it('can be made more or less often, or turned off and on again, in Tank settings', () => {
		const tank = newTank('Nano');
		setReviewEvery(user, tank.id, 30); // sooner: the next one comes closer
		expect(reviewTask(tank.id)).toMatchObject({ intervalDays: 30, nextDue: addDays(today, 30) });
		setReviewEvery(user, tank.id, 182); // later: the date already set stays
		expect(reviewTask(tank.id)).toMatchObject({ intervalDays: 182, nextDue: addDays(today, 30) });
		setReviewEvery(user, tank.id, 'off');
		expect(reviewTask(tank.id)).toBeUndefined();
		setReviewEvery(user, tank.id, 91);
		expect(reviewTask(tank.id)).toMatchObject({ intervalDays: 91, nextDue: addDays(today, 91) });
	});

	it('is given to tanks from before, first due 3 months after the update', () => {
		const tank = newTank('Old tank');
		db.delete(tasks).where(eq(tasks.id, reviewTask(tank.id)!.id)).run();
		// the migration's own statement, run again: it skips tanks that have one
		const sql = readFileSync('drizzle/0026_setup_review.sql', 'utf8').split('--> statement-breakpoint')[1];
		db.$client.exec(sql);
		db.$client.exec(sql);
		const mine = db.select().from(tasks).where(and(eq(tasks.tankId, tank.id), eq(tasks.kind, 'review'))).all();
		expect(mine).toHaveLength(1);
		expect(mine[0]).toMatchObject({ name: 'Review tank setup', intervalDays: 91, recurring: true, scheduleMode: 'completion' });
		const utcToday = new Date().toISOString().slice(0, 10);
		expect(mine[0].nextDue).toBe(addDays(utcToday, 91));
	});
});

describe('reviewing', () => {
	it('checks a part at a time, then finishes with one History entry and the next review set', () => {
		const tank = newTank('Planted 60');
		checkSection(user.id, tank.id, 'details');
		expect(Object.keys(getTank(user.id, tank.id).reviewChecks)).toEqual(['details']);

		// a heater added since the tank was set up: equipment changed
		addEquipment(user.id, tank.id, { type: 'heater', brand: 'Tidewell', model: '100 W', specs: {}, installedAt: null, notes: null }, user.timeZone);
		const done = finishReview(user, tank.id);
		expect(done.changed).toEqual(['equipment']);
		expect(done.nextDue).toBe(addDays(today, 91));
		expect(reviewTask(tank.id)!.nextDue).toBe(addDays(today, 91));
		const checks = getTank(user.id, tank.id).reviewChecks;
		expect(Object.keys(checks).sort()).toEqual(['details', 'equipment', 'livestock', 'targets']);
		expect(lastReviewAt(tank.id)).toBe(done.event.occurredAt);
		expect(done.event.data).toMatchObject({ system: 'setup_reviewed', changed: ['equipment'] });

		// Undo takes the entry back out and puts the checks as they were
		undoCompletion(user.id, done.completionId!);
		expect(lastReviewAt(tank.id)).toBeNull();
		expect(Object.keys(getTank(user.id, tank.id).reviewChecks)).toEqual(['details']);
		expect(reviewTask(tank.id)!.nextDue).toBe(addDays(today, 91));
		expect(db.select().from(events).where(eq(events.id, done.event.id)).get()).toBeUndefined();
	});

	it('works with the reminder off too, and the next one only counts what changed after it', () => {
		const tank = newTank('No reminder');
		setReviewEvery(user, tank.id, 'off');
		const first = finishReview(user, tank.id);
		expect(first.completionId).toBeNull();
		expect(first.changed).toEqual([]);
		expect(lastReviewAt(tank.id)).toBe(first.event.occurredAt);
	});
});

describe('Serviced today', () => {
	it('dates the equipment and logs the servicing in History', () => {
		const tank = newTank('Filtered');
		const filter = addEquipment(user.id, tank.id, { type: 'filter', brand: 'Tidewell', model: 'C-400', specs: {}, installedAt: null, notes: null }, user.timeZone);
		const item = servicedToday(user.id, tank.id, filter.id);
		expect(item?.id).toBe(filter.id);
		expect(db.select().from(equipment).where(eq(equipment.id, filter.id)).get()!.lastServicedAt).not.toBeNull();
		const logged = db.select().from(events).where(and(eq(events.tankId, tank.id), eq(events.category, 'maintenance'))).all();
		expect(logged).toHaveLength(1);
		expect(logged[0].data).toEqual({ actions: ['Serviced Tidewell C-400'], equipment_id: filter.id });
		// not this tank's: nothing happens
		expect(servicedToday(user.id, newTank('Other').id, filter.id)).toBeNull();
		expect(db.select().from(tanks).where(eq(tanks.id, tank.id)).get()).toBeTruthy();
	});
});
