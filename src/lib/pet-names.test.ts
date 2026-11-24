import { describe, expect, it } from 'vitest';
import { publicEntry, withoutPetNames } from './pet-names';

describe('withoutPetNames (#293)', () => {
	it("keeps a health entry's species, never its pets' names", () => {
		const e = withoutPetNames({ category: 'health', data: { names: ['Captain · Betta', 'Neon tetra'], symptoms: ['Gasping'], outcome: 'treating' } });
		expect(e.data.names).toEqual(['Betta', 'Neon tetra']);
	});

	it('drops a nickname and an old name', () => {
		expect(withoutPetNames({ data: { nickname: 'Captain', previous: 'Cap', species: 'Betta' } }).data).toEqual({ nickname: null, previous: null, species: 'Betta' });
	});
});

describe('publicEntry (#343)', () => {
	it("never names the keeper's other tank, and pets only when names are on", () => {
		const moved = { data: { action: 'moved_out', to_tank: 'Hospital 10', nickname: 'Captain', species: 'Betta' } };
		expect(publicEntry(moved, true).data).toEqual({ action: 'moved_out', to_tank: null, from_tank: null, nickname: 'Captain', species: 'Betta' });
		expect(publicEntry(moved, false).data).toMatchObject({ to_tank: null, nickname: null });
		const plain = { data: { action: 'added', count: 3 } };
		expect(publicEntry(plain, true)).toBe(plain);
	});
});
