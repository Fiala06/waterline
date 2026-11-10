import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// How many rows one request may add (#214): the limit a file's preview has
// holds for what is saved too. A database of its own, with every migration.
const dir = mkdtempSync(join(tmpdir(), 'wl-import-limits-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addSeveral } = await import('./add-several');
const { MAX_ROWS } = await import('./import-rows');
const { addLivestock, listLivestock } = await import('./specs');

const user = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
const tank = createTank(user, { name: 'Riverbed 40', type: 'planted', nominalVolumeL: 150 });
const rowsForm = (n: number) => {
	const f = new FormData();
	for (let i = 0; i < n; i++) f.append('row', JSON.stringify({ kind: 'fish', name: `Fish ${i}`, scientific: null, count: 1 }));
	return f;
};

describe('Add several (#214)', () => {
	it('adds up to 500 at once, and nothing of a longer list', () => {
		expect(addSeveral('livestock', rowsForm(MAX_ROWS + 1), user, tank.id, 'fresh')).toEqual({ error: "That's more than 500 species at once. Add them in smaller lots." });
		expect(listLivestock(user.id, tank.id)).toEqual([]);
		const lines = new FormData();
		lines.set('lines', Array.from({ length: MAX_ROWS + 1 }, (_, i) => `Plant ${i}`).join('\n'));
		expect(addSeveral('plants', lines, user, tank.id, 'fresh')).toEqual({ error: "That's more than 500 plants at once. Add them in smaller lots." });
		expect(addSeveral('livestock', rowsForm(3), user, tank.id, 'fresh')).toMatchObject({ message: '✓ Added 3 animals · 3 species' });
		expect(listLivestock(user.id, tank.id)).toHaveLength(3);
	});
});

describe('adding to a species already in the tank (#214)', () => {
	it('stops at 10,000', () => {
		const neon = { kind: 'fish' as const, commonName: 'Neon tetra', scientificName: null, count: 6000, status: 'in_tank' as const, addedAt: null, source: null };
		addLivestock(user.id, tank.id, neon);
		addLivestock(user.id, tank.id, neon);
		expect(listLivestock(user.id, tank.id).find((l) => l.commonName === 'Neon tetra')?.count).toBe(10_000);
	});
});
