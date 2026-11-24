import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The Tanks page reads each tank's last test, last water change and owner for all tanks at once (#353).
const dir = mkdtempSync(join(tmpdir(), 'wl-tank-list-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events, tests } = await import('./db/schema');
const { lastEventAtFor, lastEventOf, latestTest, latestTestAtFor } = await import('./logs');
const { ownerNames, tankPeople } = await import('./members');
const { createTank } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'lister@example.com', name: 'Lister', googleSub: 'g-lister' });
const nameless = upsertUser({ email: 'quiet.one@example.com', name: '', googleSub: 'g-quiet' });
const a = createTank(user, { name: 'A', type: 'freshwater', nominalVolumeL: 100 });
const b = createTank(user, { name: 'B', type: 'freshwater', nominalVolumeL: 60 });
const empty = createTank(user, { name: 'Empty', type: 'freshwater', nominalVolumeL: 20 });
const c = createTank(nameless, { name: 'C', type: 'freshwater', nominalVolumeL: 40 });

for (const [tank, at] of [
	[a, '2026-01-01T10:00:00.000Z'],
	[a, '2026-03-01T10:00:00.000Z'],
	[b, '2026-02-01T10:00:00.000Z']
] as const)
	db.insert(tests).values({ tankId: tank.id, takenAt: at, loggedBy: user.id }).run();
for (const [tank, category, at] of [
	[a, 'water_change', '2026-02-10T08:00:00.000Z'],
	[a, 'water_change', '2026-02-20T08:00:00.000Z'],
	[a, 'note', '2026-04-01T08:00:00.000Z'],
	[b, 'note', '2026-02-01T08:00:00.000Z']
] as const)
	db.insert(events).values({ tankId: tank.id, category, occurredAt: at, loggedBy: user.id, data: {} }).run();

describe('tank list, in one query each', () => {
	const ids = [a.id, b.id, empty.id];

	it('gives the latest test per tank, as latestTest does one by one', () => {
		const at = latestTestAtFor(ids);
		for (const id of ids) expect(at.get(id)).toBe(latestTest(id)?.takenAt);
		expect(at.has(empty.id)).toBe(false);
		expect(latestTestAtFor([]).size).toBe(0);
	});

	it('gives the last entry of a kind per tank, as lastEventOf does', () => {
		const at = lastEventAtFor(ids, 'water_change');
		for (const id of ids) expect(at.get(id)).toBe(lastEventOf(id, 'water_change')?.occurredAt);
		expect(at.get(a.id)).toBe('2026-02-20T08:00:00.000Z');
		expect(at.has(b.id)).toBe(false);
	});

	it("names each owner as tankPeople does, the address's first part without a name", () => {
		const names = ownerNames([user.id, nameless.id, user.id]);
		expect(names.get(user.id)).toBe(tankPeople(a).get(user.id));
		expect(names.get(nameless.id)).toBe(tankPeople(c).get(nameless.id));
		expect(names.get(nameless.id)).toBe('quiet.one');
		expect(ownerNames([]).size).toBe(0);
	});
});
