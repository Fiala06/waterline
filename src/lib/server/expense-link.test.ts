import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// An expense linked to a piece of equipment (#148): the item's cost, the picker, the form's check, and History's link.
const dir = mkdtempSync(join(tmpdir(), 'wl-expense-link-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, users } = await import('./db/schema');
const { eq, sql } = await import('drizzle-orm');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, removeEquipment } = await import('./specs');
const { addExpense, equipmentChoices, equipmentNames, expensesForEquipment } = await import('./expenses');
const { readExpenseForm } = await import('./expense-form');
const { eventView } = await import('./entry-view');
const { runTool } = await import('./assistant/tools');
const { todayInZone } = await import('$lib/time');

const user = upsertUser({ email: 'link@example.com', name: 'Link', googleSub: 'g-link' });
const full = db.select().from(users).where(eq(users.id, user.id)).get()!;
const tz = full.timeZone;
const today = todayInZone(tz);
const betta = createTank(full, { name: 'Betta Tank', type: 'freshwater', nominalVolumeL: 60 });
const bowl = createTank(full, { name: 'Shrimp Bowl', type: 'freshwater', nominalVolumeL: 10 });
const light = addEquipment(user.id, betta.id, { type: 'light', brand: 'Twinstar', model: '300S V', specs: {}, installedAt: null, notes: null }, tz);
const heater = addEquipment(user.id, betta.id, { type: 'heater', brand: 'Eheim', model: 'Jäger 50', specs: {}, installedAt: null, notes: null }, tz);
const expense = (what: string, amountCents: number, equipmentId: string | null, tankId = betta.id) =>
	addExpense(user.id, tankId, { date: today, amountCents, category: 'equipment', what, note: null, equipmentId });

describe('what an item cost', () => {
	it('sums the expenses linked to it, newest first', () => {
		expense('Twinstar 300S V', 12999, light.id);
		expense('Replacement bulb', 1500, light.id);
		expense('Eheim Jäger 50', 2500, heater.id);
		expense('Fittings', 400, null);
		const cost = expensesForEquipment(light.id);
		expect(cost.rows.map((r) => r.what)).toEqual(['Replacement bulb', 'Twinstar 300S V']);
		expect(cost.totalCents).toBe(14499);
		expect(expensesForEquipment(heater.id).totalCents).toBe(2500);
	});

	it('names each item of a tank, past ones too, and lists the choices in the tank first', () => {
		expect(equipmentNames([betta.id]).get(light.id)).toBe('Twinstar 300S V');
		removeEquipment(user.id, heater.id);
		expect(equipmentNames([betta.id]).get(heater.id)).toBe('Eheim Jäger 50');
		const choices = equipmentChoices([betta.id, bowl.id]);
		expect(choices[betta.id]).toEqual([
			{ id: light.id, name: 'Twinstar 300S V', past: false },
			{ id: heater.id, name: 'Eheim Jäger 50', past: true }
		]);
		expect(choices[bowl.id]).toEqual([]);
	});
});

describe('the expense form', () => {
	const form = (fields: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries({ amount: '10', what: 'Thing', category: 'equipment', date: today, ...fields })) f.set(k, v);
		return f;
	};

	it('keeps a link to an item of the tank the expense goes on, and drops any other', () => {
		expect(readExpenseForm(form({ tankId: betta.id, equipmentId: light.id }), full, betta.id).input?.equipmentId).toBe(light.id);
		// a past item can still be linked (a part bought for it before it went)
		expect(readExpenseForm(form({ tankId: betta.id, equipmentId: heater.id }), full, betta.id).input?.equipmentId).toBe(heater.id);
		expect(readExpenseForm(form({ tankId: bowl.id, equipmentId: light.id }), full, bowl.id).input?.equipmentId).toBeNull();
		expect(readExpenseForm(form({ tankId: betta.id, equipmentId: 'nonsense' }), full, betta.id).input?.equipmentId).toBeNull();
		expect(readExpenseForm(form({ tankId: betta.id }), full, betta.id).input?.equipmentId).toBeNull();
	});
});

describe('History', () => {
	it('links an equipment entry’s Item line to the item', () => {
		const installed = db
			.select()
			.from(events)
			.where(sql`json_extract(${events.data}, '$.equipment_id') = ${light.id}`)
			.get()!;
		const view = eventView(full, installed.id);
		expect(view.rows.find((r) => r.label === 'Item')).toEqual({ label: 'Item', value: 'Twinstar 300S V', href: `/tanks/${betta.id}/equipment/${light.id}` });
	});
});

describe('the spending table', () => {
	it('names the item an expense was for', async () => {
		const access = { user: full, token: {}, tankIds: new Set([betta.id]) } as never;
		const r = (await runTool(access, 'get_spending', {})) as { data: { columns: string[]; rows: Record<string, unknown>[] } };
		expect(r.data.columns).toContain('equipment');
		expect(r.data.rows.find((x) => x.what === 'Replacement bulb')?.equipment).toBe('Twinstar 300S V');
		expect(r.data.rows.find((x) => x.what === 'Fittings')?.equipment).toBeNull();
	});
});
