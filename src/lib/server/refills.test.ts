import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// CO₂ cylinder refills (#368): a refill is a History entry on the CO₂ item, its
// cost goes to Spending, a day is logged once, and the alert shows only when
// it's on and a fill is nearly used up, until the next refill.
const dir = mkdtempSync(join(tmpdir(), 'wl-refills-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser, getUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, getEquipment } = await import('./specs');
const { deleteEvent, getEvent } = await import('./logs');
const { expensesForEquipment } = await import('./expenses');
const { eventEditable, eventView } = await import('./entry-view');
const { eventTitle } = await import('$lib/events');
const { acceptMemberInvites, inviteMember } = await import('./members');
const { logRefill, refillAlerts, refillItem, refillsOf, refillStatsFor, setRefillAlert } = await import('./refills');

const me = getUser(upsertUser({ email: 'refills@example.com', name: 'Refills', googleSub: 'g-refills' }).id)!;
const friend = getUser(upsertUser({ email: 'refills-friend@example.com', name: 'Friend', googleSub: 'g-refills-friend' }).id)!;
const tank = createTank(me, { name: 'Betta 20', type: 'planted', nominalVolumeL: 75 });
acceptMemberInvites(friend.email, friend.id, { id: inviteMember(tank, friend.email, 'log', me.id).member.id });
const item = (type: 'co2' | 'filter') =>
	addEquipment(me.id, tank.id, { type, brand: 'FZone', model: type === 'co2' ? 'Pro regulator' : 'Canister', specs: type === 'co2' ? { cylinder: '2.5 lb' } : {}, schedule: null, installedAt: null, notes: null }, 'UTC');
const co2 = item('co2');
const filter = item('filter');
const tanks = [{ id: tank.id, name: tank.name }];
const refill = (day: string, costCents: number | null = null, by = me) => logRefill(by, getEquipment(me.id, co2.id), { day, note: null, costCents });

describe('cylinder refills (#368)', () => {
	it('is only for a CO₂ item of that tank', () => {
		expect(refillItem(me.id, tank.id, co2.id).id).toBe(co2.id);
		expect(() => refillItem(me.id, tank.id, filter.id)).toThrow();
		expect(() => refillItem(me.id, 'another-tank', co2.id)).toThrow();
	});

	it('logs a refill as a History entry that names the item and can’t be edited as another change', () => {
		const e = refill('2026-03-01');
		if ('error' in e) throw new Error(e.error);
		expect(e).toMatchObject({ category: 'equipment', data: { action: 'refilled', equipment_id: co2.id, item: 'FZone Pro regulator' } });
		expect(eventTitle(e, me)).toBe('Refilled FZone Pro regulator');
		expect(eventEditable(e)).toBe(false);
		expect(eventView(me, e.id).rows).toContainEqual(expect.objectContaining({ label: 'Change', value: 'Refilled' }));
		// not a service: the item's service date is its own
		expect(getEquipment(me.id, co2.id).lastServicedAt).toBeNull();
	});

	it('turns down a day that already has a refill', () => {
		expect(refill('2026-03-01')).toEqual({ error: 'A refill is already logged for that day.' });
		expect(refillsOf(co2)).toHaveLength(1);
	});

	it('puts a cost in Spending, linked to the item; someone who only logs can’t add one', () => {
		refill('2026-07-01', 2250);
		expect(expensesForEquipment(co2.id).rows).toMatchObject([{ what: 'CO₂ refill', amountCents: 2250, category: 'consumables', date: '2026-07-01' }]);
		expect(() => refill('2026-07-02', 500, friend)).toThrow();
		// nothing was logged with the refused cost
		expect(refillsOf(co2)).toHaveLength(2);
		expect('error' in refill('2026-07-03', null, friend)).toBe(false);
		deleteEvent(me.id, refillsOf(co2).at(-1)!.id);
	});

	it('works out how long a fill lasts, and follows a refill deleted', () => {
		expect(refillStatsFor(tank.id, 'UTC').get(co2.id)).toMatchObject({ count: 2, last: '2026-07-01', avgDays: 122, expected: '2026-10-31' });
		const extra = refill('2026-08-01');
		if ('error' in extra) throw new Error(extra.error);
		expect(refillStatsFor(tank.id, 'UTC').get(co2.id)).toMatchObject({ count: 3, last: '2026-08-01' });
		deleteEvent(me.id, extra.id);
		expect(() => getEvent(me.id, extra.id)).toThrow();
		expect(refillStatsFor(tank.id, 'UTC').get(co2.id)).toMatchObject({ count: 2, last: '2026-07-01' });
	});

	it('alerts only when it’s on and the fill is nearly used up, until the next refill', () => {
		expect(refillAlerts(me, tanks, '2026-10-25')).toEqual([]);
		setRefillAlert(me.id, getEquipment(me.id, co2.id), true);
		expect(refillAlerts(me, tanks, '2026-10-01')).toEqual([]);
		const [a] = refillAlerts(me, tanks, '2026-10-25');
		expect(a).toMatchObject({
			kind: 'refill',
			key: `refill:${co2.id}:2026-07-01`,
			tankId: tank.id,
			title: 'FZone Pro regulator: cylinder likely running low',
			sub: 'Betta 20 · last refilled Jul 1 · the last fill lasted about 4 months',
			href: `/tanks/${tank.id}/equipment/${co2.id}/refills`
		});
		refill('2026-10-26');
		expect(refillAlerts(me, tanks, '2026-10-27')).toEqual([]);
		setRefillAlert(me.id, getEquipment(me.id, co2.id), false);
		expect(refillAlerts(me, tanks, '2027-06-01')).toEqual([]);
	});
});
