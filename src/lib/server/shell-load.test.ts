import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The app shell's data (#105): every signed-in page loads it, so its cost
// mustn't grow a query or more per tank. Owned and shared tanks, each with
// readings, judged and counted as before.
const dir = mkdtempSync(join(tmpdir(), 'wl-shell-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, UPDATE_CHECK: 'off' } }));
const { db } = await import('./db');
const { testReadings, tests } = await import('./db/schema');
const { createTank, listParams } = await import('./tanks');
const { inviteMember } = await import('./members');
const { upsertUser } = await import('./users');
const { load } = await import('../../routes/(app)/+layout.server');

const keeper = upsertUser({ email: 'shell@example.com', name: 'Shell', googleSub: 'g-shell' });
const friend = upsertUser({ email: 'shell-friend@example.com', name: 'Friend', googleSub: 'g-shell-friend' });
const at = new Date(Date.now() - 3_600_000).toISOString();

/** A keeper with `n` tanks of their own and two shared with them, each tested. */
let made = 0;
function tanksFor(n: number) {
	for (let k = 0; k < n; k++, made++) {
		const i = made;
		const t = createTank(keeper, { name: `Tank ${i}`, type: 'freshwater', nominalVolumeL: 100 });
		const ps = listParams(t.id);
		const test = db.insert(tests).values({ tankId: t.id, takenAt: at, loggedBy: keeper.id }).returning().get();
		// nitrate high on every third tank, so there are alerts to find
		db.insert(testReadings)
			.values(ps.slice(0, 4).map((p, j) => ({ testId: test.id, parameterId: p.id, value: j === 0 && i % 3 === 0 ? 999 : (p.min ?? 0) })))
			.run();
	}
}

const cookies = { get: () => undefined, set: () => {}, delete: () => {}, getAll: () => [], serialize: () => '' };
/** What these tests read of the shell's data. */
interface Shell {
	tanks: { name: string; role: string; outOfRange: number; tested: boolean }[];
	alerts: { kind: string }[];
}
const run = (user: typeof keeper) => load({ locals: { user }, url: new URL('http://x/'), cookies, params: {}, route: { id: '/(app)' } } as never) as unknown as Shell;

/** How many SQL statements the shell's load runs. */
function statements(user: typeof keeper) {
	const client = db.$client;
	let n = 0;
	const prepare = client.prepare.bind(client);
	const spy = vi.spyOn(client, 'prepare').mockImplementation(((src: string) => {
		const st = prepare(src);
		for (const m of ['all', 'get', 'run'] as const) {
			const f = st[m].bind(st);
			(st as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => (n++, (f as (...x: unknown[]) => unknown)(...a));
		}
		return st;
	}) as typeof client.prepare);
	try {
		const data = run(user);
		return { n, data };
	} finally {
		spy.mockRestore();
	}
}

describe('the app shell over many tanks (#105)', () => {
	const shared = [createTank(friend, { name: 'Friend view', type: 'planted', nominalVolumeL: 60 }), createTank(friend, { name: 'Friend log', type: 'reef', nominalVolumeL: 200 })];
	inviteMember(shared[0], keeper.email, 'view', friend.id);
	inviteMember(shared[1], keeper.email, 'log', friend.id);

	const counts: Record<number, number> = {};
	let have = 0;
	for (const n of [1, 10, 25, 50]) {
		it(`${n} tanks of their own and 2 shared`, () => {
			tanksFor(n - have);
			have = n;
			const { n: q, data } = statements(keeper);
			counts[n] = q;
			expect(data.tanks).toHaveLength(n + 2);
			const byName = new Map(data.tanks.map((t) => [t.name, t]));
			expect(byName.get('Friend view')?.role).toBe('view');
			expect(byName.get('Friend log')?.role).toBe('log');
			expect(byName.get('Tank 0')?.role).toBe('owner');
			// every third of their tanks has nitrate out of range; the shared ones are untested
			expect(data.tanks.filter((t) => t.outOfRange > 0)).toHaveLength(Math.ceil(n / 3));
			expect(data.alerts.filter((a) => a.kind === 'reading')).toHaveLength(Math.ceil(n / 3));
			expect(byName.get('Friend view')?.tested).toBe(false);
			expect(byName.get('Tank 0')?.tested).toBe(true);
		});
	}

	it('runs about the same number of queries whatever the number of tanks', () => {
		console.log('shell statements by tank count', counts);
		expect(counts[50] - counts[1]).toBeLessThanOrEqual(2);
	});

	it('shows the friend only their own tanks and the shared ones, as before', () => {
		const { data } = statements(friend);
		expect(data.tanks.map((t) => t.name).sort()).toEqual(['Friend log', 'Friend view']);
		expect(data.tanks.every((t) => t.role === 'owner')).toBe(true);
	});
});
