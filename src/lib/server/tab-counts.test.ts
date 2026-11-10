import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The tank tabs' counts (#242), counted in the database: the same numbers the lists give.
const dir = mkdtempSync(join(tmpdir(), 'wl-tab-counts-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, addLivestock, addPlant, listEquipment, listLivestock, listPlants, removeEquipment, removePlant, tankTabCounts } = await import('./specs');

const user = upsertUser({ email: 'counts@example.com', name: 'Counts' });
const tank = createTank(user, { name: 'Counts tank', type: 'planted', nominalVolumeL: 100 });
const other = createTank(user, { name: 'Other tank', type: 'planted', nominalVolumeL: 60 });
const fish = (commonName: string, count: number, status: 'in_tank' | 'quarantine' = 'in_tank') => ({ kind: 'fish' as const, commonName, scientificName: null, count, status, addedAt: null, source: null });

describe('tankTabCounts (#242)', () => {
	it('is zero for an empty tank', () => {
		expect(tankTabCounts(tank.id)).toEqual({ livestock: 0, plants: 0, equipment: 0 });
	});

	it('counts what the lists show: animals in the tank or quarantine, plants and items not removed', () => {
		addLivestock(user.id, tank.id, fish('Neon tetra', 8));
		addLivestock(user.id, tank.id, fish('Otocinclus', 3));
		addLivestock(user.id, tank.id, fish('Amano shrimp', 5, 'quarantine'));
		addLivestock(user.id, other.id, fish('Guppy', 4));
		const fern = addPlant(user.id, tank.id, { name: 'Java fern', scientificName: null, position: 'midground', status: 'thriving' } as never);
		addPlant(user.id, tank.id, { name: 'Anubias', scientificName: null, position: 'midground', status: 'thriving' } as never);
		removePlant(user.id, fern.id);
		const filter = addEquipment(user.id, tank.id, { type: 'filter', brand: 'Tidewell', model: 'C-400', specs: {}, installedAt: null, notes: null }, user.timeZone);
		addEquipment(user.id, tank.id, { type: 'heater', brand: 'Warmth', model: '100', specs: {}, installedAt: null, notes: null }, user.timeZone);
		removeEquipment(user.id, filter.id);

		const listed = {
			livestock: listLivestock(user.id, tank.id).reduce((n, l) => n + (l.status === 'in_tank' || l.status === 'quarantine' ? l.count : 0), 0),
			plants: listPlants(user.id, tank.id).length,
			equipment: listEquipment(user.id, tank.id).length
		};
		expect(tankTabCounts(tank.id)).toEqual(listed);
		expect(listed).toEqual({ livestock: 16, plants: 1, equipment: 1 });
	});
});
