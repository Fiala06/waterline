import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Moving livestock between the keeper's tanks (#317): all or some, a pet whole,
// into a matching group or as itself, both lists and both Histories together,
// never a loss or a purchase; the same tank, someone else's tank or a resent
// form changes nothing.
const dir = mkdtempSync(join(tmpdir(), 'wl-livestock-move-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, livestock } = await import('./db/schema');
const { and, eq } = await import('drizzle-orm');
const { upsertUser } = await import('./users');
const { createTank, setArchived } = await import('./tanks');
const { addLivestock, changeCount, getLivestock, listLivestock, moveLivestock, nameLivestock } = await import('./specs');
const { acceptMemberInvites, inviteMember } = await import('./members');
const { eventTitle } = await import('$lib/events');

const me = upsertUser({ email: 'mover@example.com', name: 'Mover', googleSub: 'g-mover' });
const friend = upsertUser({ email: 'mover-friend@example.com', name: 'Friend', googleSub: 'g-mover-friend' });
const qt = createTank(me, { name: 'Quarantine', type: 'freshwater', nominalVolumeL: 40 });
const display = createTank(me, { name: 'Display', type: 'planted', nominalVolumeL: 200 });
const theirs = createTank(friend, { name: 'Friend tank', type: 'freshwater', nominalVolumeL: 100 });
acceptMemberInvites(me.email, me.id, { id: inviteMember(theirs, me.email, 'log', friend.id).member.id });
const fish = (tankId: string, name: string, count: number, status: 'in_tank' | 'quarantine' = 'quarantine') =>
	addLivestock(me.id, tankId, { kind: 'fish', commonName: name, scientificName: null, count, status, addedAt: '2026-11-01', source: 'Local store' }).row;
const counts = (tankId: string) => Object.fromEntries(listLivestock(me.id, tankId).map((l) => [l.nickname ?? `${l.commonName}/${l.status}`, l.count]));
const livestockEvents = (tankId: string) => db.select().from(events).where(and(eq(events.tankId, tankId), eq(events.category, 'livestock'))).all();
const prefs = { unitSystem: 'metric', hardnessUnit: 'dgh' } as const;

describe('moving livestock between tanks (#317)', () => {
	it('moves part of a group, then the rest into it, with a pair of History entries each time', () => {
		const neons = fish(qt.id, 'Neon tetra', 10);
		const before = livestockEvents(qt.id).length;
		moveLivestock(me.id, neons.id, display.id, 4);
		expect(counts(qt.id)['Neon tetra/quarantine']).toBe(6);
		expect(counts(display.id)['Neon tetra/in_tank']).toBe(4);
		const out = livestockEvents(qt.id).slice(before);
		expect(out.map((e) => [e.data.action, e.data.count])).toEqual([['moved_out', 4]]);
		expect(eventTitle(out[0], prefs)).toBe('Moved 4 Neon tetra to Display');
		const inn = livestockEvents(display.id).filter((e) => e.data.action === 'moved_in');
		expect(eventTitle(inn[0], prefs)).toBe('4 Neon tetra moved in from Quarantine');
		// the rest: into the group already there; never a loss or a purchase
		moveLivestock(me.id, neons.id, display.id, 6);
		expect(counts(qt.id)['Neon tetra/quarantine']).toBeUndefined();
		expect(counts(display.id)['Neon tetra/in_tank']).toBe(10);
		const all = [...livestockEvents(qt.id), ...livestockEvents(display.id)].filter((e) => e.data.name === 'Neon tetra');
		expect(all.some((e) => e.data.action === 'removed')).toBe(false);
		expect(all.filter((e) => e.data.action === 'added')).toHaveLength(1); // only when they were bought
	});

	it('moves a whole entry as itself: a pet keeps its name, notes and where it came from', () => {
		const bettas = fish(qt.id, 'Betta', 1);
		const pet = nameLivestock(me.id, bettas.id, 'Captain');
		db.update(livestock).set({ notes: 'Likes the left corner' }).where(eq(livestock.id, pet.id)).run();
		const moved = moveLivestock(me.id, pet.id, display.id, 1);
		expect(moved.id).toBe(pet.id);
		const after = getLivestock(me.id, pet.id);
		expect(after).toMatchObject({ tankId: display.id, nickname: 'Captain', notes: 'Likes the left corner', source: 'Local store', status: 'in_tank', removedAt: null });
		const inn = livestockEvents(display.id).find((e) => e.data.action === 'moved_in' && e.data.livestock_id === pet.id)!;
		expect(eventTitle(inn, prefs)).toBe('Captain moved in from Quarantine · Betta');
	});

	it('refuses the same tank, an archived one, someone else’s, and too many, changing nothing', () => {
		const cories = fish(qt.id, 'Corydoras', 5);
		const snapshot = () => [counts(qt.id), counts(display.id), livestockEvents(qt.id).length, livestockEvents(display.id).length];
		const was = snapshot();
		expect(() => moveLivestock(me.id, cories.id, qt.id, 1)).toThrow();
		expect(() => moveLivestock(me.id, cories.id, theirs.id, 1)).toThrow(); // shared with me, not mine
		expect(() => moveLivestock(me.id, cories.id, display.id, 6)).toThrow();
		expect(() => moveLivestock(me.id, cories.id, display.id, 0)).toThrow();
		const spare = createTank(me, { name: 'Spare', type: 'freshwater', nominalVolumeL: 20 });
		setArchived(me.id, spare.id, true);
		expect(() => moveLivestock(me.id, cories.id, spare.id, 1)).toThrow();
		// someone else can't move mine
		expect(() => moveLivestock(friend.id, cories.id, display.id, 1)).toThrow();
		expect(snapshot()).toEqual(was);
	});

	it('does a resent move once', () => {
		const shrimp = fish(qt.id, 'Amano shrimp', 8);
		moveLivestock(me.id, shrimp.id, display.id, 3, { clientId: 'move-key-1' });
		moveLivestock(me.id, shrimp.id, display.id, 3, { clientId: 'move-key-1' });
		expect(counts(qt.id)['Amano shrimp/quarantine']).toBe(5);
		expect(counts(display.id)['Amano shrimp/in_tank']).toBe(3);
	});
});

describe('livestock entries, whole or not at all (#348)', () => {
	it("say who logged them, on the keeper's tank and on one shared with them", () => {
		const guppies = fish(display.id, 'Guppy', 5, 'in_tank');
		const shared = addLivestock(me.id, theirs.id, { kind: 'fish', commonName: 'Platy', scientificName: null, count: 3, status: 'in_tank', addedAt: '2026-11-01', source: null }).row;
		changeCount(me.id, guppies.id, 6, 'added');
		changeCount(me.id, shared.id, 4, 'added');
		for (const tankId of [display.id, theirs.id]) for (const e of livestockEvents(tankId)) expect(e.loggedBy, e.data.action as string).toBe(me.id);
	});

	it('change nothing when their History entry fails (a replayed entry)', () => {
		const tetras = fish(display.id, 'Ember tetra', 8, 'in_tank');
		changeCount(me.id, tetras.id, 7, 'loss', { clientId: 'replayed-1' });
		// the same entry again, for another fish: its History entry is refused, so the count stays
		const rasboras = fish(display.id, 'Harlequin rasbora', 6, 'in_tank');
		expect(() => changeCount(me.id, rasboras.id, 5, 'loss', { clientId: 'replayed-1' })).toThrow();
		expect(getLivestock(me.id, rasboras.id).count).toBe(6);
	});
});
