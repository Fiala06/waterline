import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Stock (#318): what's left in a bottle, from a measurement, refills and the
// doses logged in mL under its name in the keeper's own tanks since; every dose
// counted once however it was logged, edited, deleted or replayed; the alert
// only when asked for, quiet again once it's refilled.
const dir = mkdtempSync(join(tmpdir(), 'wl-stock-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser, getUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createEvent, deleteEvent, updateEvent } = await import('./logs');
const { addProduct } = await import('./products');
const { completeTask, createTask } = await import('./tasks');
const { measureStock, refillStock, setLowStock, stockAlerts, stockFor, stopStock } = await import('./stock');
const { acceptMemberInvites, inviteMember } = await import('./members');

const me = getUser(upsertUser({ email: 'stock@example.com', name: 'Stock', googleSub: 'g-stock' }).id)!;
const friend = getUser(upsertUser({ email: 'stock-friend@example.com', name: 'Friend', googleSub: 'g-stock-friend' }).id)!;
const tank = createTank(me, { name: 'Planted 60', type: 'planted', nominalVolumeL: 60 });
const theirs = createTank(friend, { name: 'Their tank', type: 'planted', nominalVolumeL: 60 });
acceptMemberInvites(me.email, me.id, { id: inviteMember(theirs, me.email, 'log', friend.id).member.id });
const ferts = addProduct(me.id, { name: 'Thrive S', url: 'https://example.com/thrive', note: null, strengthMgPerMl: null, strengthOf: null });

let clock = Date.parse('2026-11-01T08:00:00Z');
const next = () => new Date((clock += 3_600_000)).toISOString();
const dose = (tankId: string, data: Record<string, unknown>, clientId?: string) =>
	createEvent(me.id, tankId, { category: 'dosing', occurredAt: next(), note: null, data, clientId }, { timeZone: 'UTC' }).event;
const left = () => stockFor(me.id).get(ferts.id);

describe('stock (#318)', () => {
	it('is untracked until measured, then takes off doses in mL logged since, under the exact name', () => {
		dose(tank.id, { product: 'Thrive S', amount: 5, unit: 'mL' }); // before tracking: not counted
		expect(left()).toBeUndefined();
		measureStock(me.id, ferts.id, 500, null, next());
		expect(left()).toMatchObject({ left: 500, estimated: false, doses: { count: 0 } });
		dose(tank.id, { product: 'thrive s ', amount: 5, unit: 'mL' });
		dose(tank.id, { product: 'Thrive S', amount: 2, unit: 'tsp' }); // another unit: can't be compared
		dose(tank.id, { product: 'Thrive', amount: 9, unit: 'mL' }); // another product
		dose(theirs.id, { product: 'Thrive S', amount: 9, unit: 'mL' }); // someone else's tank
		expect(left()).toMatchObject({ left: 495, estimated: true, doses: { count: 1, ml: 5 } });
	});

	it('counts a routine’s Done once, through the dose it logs, and follows an edit, a delete and a replay', () => {
		const routine = createTask(me.id, tank.id, { name: 'Thrive S', kind: 'dosing', recurring: true, intervalDays: 1, scheduleMode: 'completion', nextDue: '2026-11-01', openFormOnDone: false, product: 'Thrive S', amount: 3, amountUnit: 'mL' });
		completeTask(me.id, routine.id, { at: next(), timeZone: 'UTC' });
		expect(left()!.left).toBe(492);
		const d = dose(tank.id, { product: 'Thrive S', amount: 10, unit: 'mL' }, 'offline-1');
		dose(tank.id, { product: 'Thrive S', amount: 10, unit: 'mL' }, 'offline-1'); // replayed: the same entry
		expect(left()!.left).toBe(482);
		updateEvent(me.id, d.id, { occurredAt: d.occurredAt, note: null, data: { product: 'Thrive S', amount: 4, unit: 'mL' } });
		expect(left()!.left).toBe(488);
		deleteEvent(me.id, d.id);
		expect(left()!.left).toBe(492);
	});

	it('adds refills, and a new measurement starts the count again', () => {
		refillStock(me.id, ferts.id, 100, 'new bottle', next());
		expect(left()!.left).toBe(592);
		measureStock(me.id, ferts.id, 250, null, next());
		expect(left()).toMatchObject({ left: 250, estimated: false });
		expect(() => refillStock(me.id, ferts.id, 0)).toThrow();
	});

	it('alerts below the low mark only when asked, and quietly again after a refill', () => {
		setLowStock(me.id, ferts.id, 300, false);
		expect(left()!.low).toBe(true);
		expect(stockAlerts(me.id)).toEqual([]);
		setLowStock(me.id, ferts.id, 300, true);
		const [a] = stockAlerts(me.id);
		expect(a).toMatchObject({ kind: 'stock', title: 'Thrive S is running low', sub: '250 mL left · below 300 mL', href: `/settings/products/${ferts.id}/stock`, tankId: null });
		refillStock(me.id, ferts.id, 500, null, next());
		expect(stockAlerts(me.id)).toEqual([]);
		// the friend sees nothing of mine
		expect(stockAlerts(friend.id)).toEqual([]);
		stopStock(me.id, ferts.id);
		expect(left()).toBeUndefined();
		expect(stockAlerts(me.id)).toEqual([]);
	});
});
