import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Top-offs (#316): water added for what evaporated, logged on their own, in
// liters or gallons, and never a water change: no percentage, no water-change
// reminder done, no "last water change".
const dir = mkdtempSync(join(tmpdir(), 'wl-top-off-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser, getUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createEvent, lastEventOf } = await import('./logs');
const { completableTask, parseEventData } = await import('./log-forms');
const { completeTask, createTask, getTask } = await import('./tasks');
const { db } = await import('./db');
const { events, users } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { eventTitle, taskKindFor } = await import('$lib/events');
const { todayInZone } = await import('$lib/time');

const metric = getUser(upsertUser({ email: 'topoff-metric@example.com', name: 'Metric', googleSub: 'g-topoff-m' }).id)!;
db.update(users).set({ unitSystem: 'metric' }).where(eq(users.id, metric.id)).run();
const m = getUser(metric.id)!;
const imperial = getUser(upsertUser({ email: 'topoff-imperial@example.com', name: 'Imperial', googleSub: 'g-topoff-i' }).id)!;
const tank = createTank(m, { name: 'Nano', type: 'freshwater', nominalVolumeL: 60 });
const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('a top-off entry (#316)', () => {
	it('keeps its amount in liters, entered in liters or gallons, with its source and never a percentage', () => {
		expect(parseEventData('top_off', form({ volume: '2', source: 'rodi' }), tank, m)).toEqual({ data: { volume_l: 2, source: 'rodi' }, errors: {} });
		const gal = parseEventData('top_off', form({ volume: '1', source: 'tap' }), tank, imperial);
		expect(gal.data.volume_l).toBeCloseTo(3.785, 2);
		expect(gal.data).not.toHaveProperty('percent');
		// how much is optional; a bad amount or more than the tank holds isn't
		expect(parseEventData('top_off', form({ volume: '' }), tank, m)).toEqual({ data: {}, errors: {} });
		expect(parseEventData('top_off', form({ volume: '-1' }), tank, m).errors.volume).toBe('Enter an amount above 0, or leave it blank.');
		expect(parseEventData('top_off', form({ volume: '80' }), tank, m).errors.volume).toBeTruthy();
	});

	it('reads as a top-off in History, in either unit', () => {
		const e = { category: 'top_off' as const, note: null, data: { volume_l: 3.785411784, source: 'rodi' } };
		expect(eventTitle(e, { unitSystem: 'imperial', hardnessUnit: 'dgh' })).toBe('Top off · 1 gal · RODI');
		expect(eventTitle(e, { unitSystem: 'metric', hardnessUnit: 'dgh' })).toBe('Top off · 3.8 L · RODI');
		expect(eventTitle({ category: 'top_off', note: null, data: {} }, { unitSystem: 'metric', hardnessUnit: 'dgh' })).toBe('Top off');
	});

	it('on the same day as a water change: the change stays the last one, and only a top-off reminder is offered', () => {
		const today = todayInZone(m.timeZone);
		const wcTask = createTask(m.id, tank.id, { name: 'Water change', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		const change = createEvent(m.id, tank.id, { category: 'water_change', occurredAt: `${today}T08:00:00.000Z`, note: null, data: { percent: 25 } }, { timeZone: m.timeZone }).event;
		createEvent(m.id, tank.id, { category: 'top_off', occurredAt: `${today}T20:00:00.000Z`, note: null, data: { volume_l: 1 } }, { timeZone: m.timeZone });
		expect(lastEventOf(tank.id, 'water_change')?.id).toBe(change.id);

		// no top-off reminder yet: a top-off offers nothing, and never the water change's
		expect(taskKindFor('top_off')).toBe('top_off');
		expect(completableTask(m, tank.id, taskKindFor('top_off'), null, today)).toBeNull();
		const topTask = createTask(m.id, tank.id, { name: 'Top off', kind: 'top_off', recurring: true, intervalDays: 3, scheduleMode: 'completion', nextDue: today, openFormOnDone: false });
		expect(completableTask(m, tank.id, taskKindFor('top_off'), null, today)?.id).toBe(topTask.id);
		expect(completableTask(m, tank.id, taskKindFor('water_change'), null, today)?.id).toBe(wcTask.id);
	});

	it("a top-off reminder's Done logs a top-off, not a water change", () => {
		const t = createTask(m.id, tank.id, { name: 'Top off ATO', kind: 'top_off', recurring: true, intervalDays: 5, scheduleMode: 'completion', nextDue: todayInZone(m.timeZone), openFormOnDone: false });
		const before = lastEventOf(tank.id, 'water_change')?.id;
		completeTask(m.id, t.id, { timeZone: m.timeZone });
		const logged = db.select().from(events).where(eq(events.tankId, tank.id)).all().filter((e) => e.data.task_id === t.id);
		expect(logged.map((e) => e.category)).toEqual(['top_off']);
		expect(lastEventOf(tank.id, 'water_change')?.id).toBe(before);
		expect(getTask(m.id, t.id).nextDue).not.toBe(todayInZone(m.timeZone));
	});
});
