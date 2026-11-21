import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// #307: each expense keeps the currency it was entered in; the preference is only the default for new ones.
const dir = mkdtempSync(join(tmpdir(), 'wl-expense-currency-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { users } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { upsertUser, updateUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment } = await import('./specs');
const { addExpense, expensesForEquipment, getExpense, listExpenses, spendingSummary, spentThisYear, updateExpense } = await import('./expenses');
const { addWish, addWishToTank, parseWish, wishTotals, listWishes } = await import('./wishes');
const { runTool } = await import('./assistant/tools');
const { fmtMoney, fmtSums } = await import('$lib/money');
const { todayInZone } = await import('$lib/time');

const u = upsertUser({ email: 'currency@example.com', name: 'Cur', googleSub: 'g-cur' });
const me = () => db.select().from(users).where(eq(users.id, u.id)).get()!;
const today = todayInZone(me().timeZone);
const tank = createTank(me(), { name: 'Riverbed 40', type: 'freshwater', nominalVolumeL: 150 });
const base = { date: today, category: 'livestock' as const, note: null };

describe('an expense’s currency', () => {
	it('stays when the preference changes from USD to EUR', () => {
		const gourami = addExpense(u.id, tank.id, { ...base, amountCents: 1299, what: 'Honey gourami', currency: me().currency });
		expect(gourami.currency).toBe('USD');
		updateUser(u.id, { currency: 'EUR' });
		expect(fmtMoney(getExpense(u.id, gourami.id).amountCents, getExpense(u.id, gourami.id).currency)).toBe('$12.99');
		// saving its details again doesn't relabel it either
		updateExpense(u.id, gourami.id, { ...base, tankId: tank.id, amountCents: 1299, what: 'Honey gourami (2)' });
		expect(getExpense(u.id, gourami.id).currency).toBe('USD');
	});

	it('takes the new preference for a new purchase, and totals each currency apart', () => {
		addExpense(u.id, tank.id, { ...base, amountCents: 500, what: 'Java moss', category: 'plants', currency: me().currency });
		const s = spendingSummary(listExpenses(u.id, tank.id), today, me().currency);
		expect(fmtSums(s.month, me().currency)).toBe('€5.00 + $12.99');
		expect(spentThisYear(u.id, today.slice(0, 4))).toEqual({ USD: 1299, EUR: 500 });
	});

	it('shows amounts with no decimal places in yen', () => {
		updateUser(u.id, { currency: 'JPY' });
		const item = addEquipment(u.id, tank.id, { type: 'heater', brand: 'Eheim', model: 'Jäger 50', specs: {}, installedAt: null, notes: null }, me().timeZone);
		addExpense(u.id, tank.id, { ...base, category: 'equipment', amountCents: 300000, what: 'Heater', equipmentId: item.id, currency: me().currency });
		addExpense(u.id, tank.id, { ...base, category: 'equipment', amountCents: 999, what: 'Suction cups', equipmentId: item.id, currency: 'USD' });
		expect(fmtSums(expensesForEquipment(item.id).totals, me().currency)).toBe('¥3,000 + $9.99');
	});

	it('logs a wish’s purchase in the wish’s currency', () => {
		updateUser(u.id, { currency: 'GBP' });
		const f = new FormData();
		for (const [k, v] of Object.entries({ kind: 'fish', name: 'Pearl gourami', count: '1', price: '8.50' })) f.set(k, v);
		const w = addWish(u.id, tank.id, parseWish(f).input, me().currency);
		updateUser(u.id, { currency: 'EUR' });
		expect(wishTotals(listWishes(u.id, tank.id)).sums).toEqual({ GBP: 850 });
		addWishToTank(me(), tank.id, w.id, { spend: true });
		const bought = listExpenses(u.id, tank.id).find((e) => e.what === '1 Pearl gourami')!;
		expect(bought).toMatchObject({ amountCents: 850, currency: 'GBP' });
	});

	it('gives each row its own currency to an assistant', async () => {
		const access = { user: me(), token: {}, tankIds: new Set([tank.id]) } as never;
		const r = (await runTool(access, 'get_spending', {})) as { data: { rows: Record<string, unknown>[] } };
		expect(r.data.rows.find((x) => x.what === 'Honey gourami (2)')).toMatchObject({ amount: 12.99, currency: 'USD' });
		expect(r.data.rows.find((x) => x.what === 'Java moss')).toMatchObject({ amount: 5, currency: 'EUR' });
	});
});
