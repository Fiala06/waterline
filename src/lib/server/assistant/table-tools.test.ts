import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The tables for dashboards and spreadsheets: flat rows across a token's tanks.
const dir = mkdtempSync(join(tmpdir(), 'wl-tables-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('../db');
const { users } = await import('../db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser } = await import('../users');
const { createTank, listParams } = await import('../tanks');
const { createEvent, createTest } = await import('../logs');
const { createTask } = await import('../tasks');
const { addExpense } = await import('../expenses');
const { runTool } = await import('./tools');
const { dueWord, toCsv } = await import('./table-tools');
const { todayInZone, addDays } = await import('$lib/time');

const made = upsertUser({ email: 'tables@example.com', name: 'Tables', googleSub: 'g-tables' });
db.update(users).set({ timeZone: 'America/Los_Angeles', unitSystem: 'imperial', hardnessUnit: 'ppm', currency: 'USD' }).where(eq(users.id, made.id)).run();
const user = db.select().from(users).where(eq(users.id, made.id)).get()!;
const tz = { timeZone: user.timeZone };

const betta = createTank(user, { name: 'Betta Tank', type: 'freshwater', nominalVolumeL: 60 });
const bowl = createTank(user, { name: 'Shrimp Bowl', type: 'freshwater', nominalVolumeL: 10 });
const p = (tankId: string, key: string) => listParams(tankId).find((x) => x.key === key)!;
const hour = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// nitrate 40 ppm is out of range; pH 7 is fine; 25 °C is 77 °F
createTest(user.id, betta.id, { takenAt: hour(30), note: null, readings: new Map([[p(betta.id, 'no3').id, 40], [p(betta.id, 'ph').id, 7], [p(betta.id, 'temp').id, 25]]) }, tz);
createTest(user.id, bowl.id, { takenAt: hour(5), note: null, readings: new Map([[p(bowl.id, 'ph').id, 7.2]]) }, tz);
createEvent(user.id, betta.id, { category: 'water_change', occurredAt: hour(48), note: 'Before trip', data: { percent: 50, source: 'rodi' } }, tz);
createEvent(user.id, bowl.id, { category: 'water_change', occurredAt: hour(2), note: null, data: { volume_l: 2.5 } }, tz);
const today = todayInZone(user.timeZone);
createTask(user.id, betta.id, { name: 'Water change', kind: 'water_change', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: addDays(today, -2), openFormOnDone: false });
createTask(user.id, bowl.id, { name: 'Clean filter', kind: 'maintenance', recurring: true, intervalDays: 30, scheduleMode: 'completion', nextDue: addDays(today, 3), openFormOnDone: false });
addExpense(user.id, betta.id, { date: today, amountCents: 1299, category: 'consumables', what: 'Seachem Prime', note: null });

const access = { user, token: {}, tankIds: new Set([betta.id, bowl.id]) } as never;
type Table = { columns: string[]; rows: Record<string, unknown>[] };
const rowsOf = async (tool: string, args: Record<string, unknown> = {}) => {
	const r = await runTool(access, tool, args);
	if (r.kind !== 'json') throw new Error('expected json');
	return r.data as Table;
};

describe('reading rows', () => {
	it('gives one row per reading across every tank, in the keeper’s units with a status word', async () => {
		const t = await rowsOf('get_reading_rows');
		expect(t.rows).toHaveLength(4);
		expect(t.columns).toContain('status');
		const no3 = t.rows.find((r) => r.key === 'no3')!;
		expect(no3).toMatchObject({ tank: 'Betta Tank', parameter: 'Nitrate', value: 40, unit: 'ppm', status: 'High' });
		expect(t.rows.find((r) => r.key === 'temp')).toMatchObject({ value: 77, unit: '°F' });
		// oldest first
		expect(t.rows.at(-1)!.tank).toBe('Shrimp Bowl');
	});

	it('narrows to one tank or one parameter', async () => {
		expect((await rowsOf('get_reading_rows', { tank_id: bowl.id })).rows).toHaveLength(1);
		expect((await rowsOf('get_reading_rows', { parameter: 'pH' })).rows.map((r) => r.tank)).toEqual(['Betta Tank', 'Shrimp Bowl']);
	});
});

describe('water changes', () => {
	it('works out the percent or the volume from the tank’s size', async () => {
		const t = await rowsOf('get_water_changes');
		expect(t.rows[0]).toMatchObject({ tank: 'Shrimp Bowl', percent: 25, volume_unit: 'gal' });
		expect(t.rows[1]).toMatchObject({ tank: 'Betta Tank', percent: 50, source: 'RODI', note: 'Before trip' });
		expect(t.rows[1].volume).toBeCloseTo(7.9, 1);
	});
});

describe('tasks', () => {
	it('lists open tasks soonest first with days until due', async () => {
		const t = await rowsOf('get_tasks');
		// a new tank's own reminders (a water change, the setup review) come after
		expect(t.rows.slice(0, 2).map((r) => [r.task, r.days_until_due, r.status])).toEqual([
			['Water change', -2, 'Overdue'],
			['Clean filter', 3, 'Due soon']
		]);
		const due = t.rows.map((r) => r.days_until_due as number);
		expect(due).toEqual([...due].sort((a, b) => a - b));
	});

	it('names how due a task is', () => {
		expect([dueWord(-1), dueWord(0), dueWord(7), dueWord(8)]).toEqual(['Overdue', 'Due today', 'Due soon', 'Upcoming']);
	});
});

describe('spending', () => {
	it('gives amounts in the keeper’s currency', async () => {
		const t = await rowsOf('get_spending');
		expect(t.rows).toEqual([expect.objectContaining({ tank: 'Betta Tank', amount: 12.99, currency: 'USD', what: 'Seachem Prime' })]);
	});
});

describe('overview', () => {
	it('sums up each tank in a row', async () => {
		const t = await rowsOf('get_overview');
		const b = t.rows.find((r) => r.tank === 'Betta Tank')!;
		expect(b).toMatchObject({ readings_out: 1, out_of_range: 'Nitrate high', tasks_overdue: 1, tasks_due_7_days: 1 });
		expect(b.readings_ok).toBeGreaterThanOrEqual(1);
		expect(b.days_since_water_change).toBeGreaterThanOrEqual(1);
		const s = t.rows.find((r) => r.tank === 'Shrimp Bowl')!;
		expect(s).toMatchObject({ readings_out: 0, tasks_overdue: 0, tasks_due_7_days: 2 });
	});
});

describe('CSV', () => {
	it('quotes what needs quoting and defuses formulas', () => {
		const csv = toCsv(['a', 'b', 'c'], [{ a: 'x, y', b: '=SUM(A1)', c: -2 }, { a: 'say "hi"', b: null, c: true }]);
		expect(csv).toBe('a,b,c\r\n"x, y",\'=SUM(A1),-2\r\n"say ""hi""",,yes\r\n');
	});
});
