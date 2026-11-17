import { describe, expect, it } from 'vitest';
import { withoutPetNames } from './pet-names';

describe('withoutPetNames (#293)', () => {
	it("keeps a health entry's species, never its pets' names", () => {
		const e = withoutPetNames({ category: 'health', data: { names: ['Captain · Betta', 'Neon tetra'], symptoms: ['Gasping'], outcome: 'treating' } });
		expect(e.data.names).toEqual(['Betta', 'Neon tetra']);
	});

	it('drops a nickname and an old name', () => {
		expect(withoutPetNames({ data: { nickname: 'Captain', previous: 'Cap', species: 'Betta' } }).data).toEqual({ nickname: null, previous: null, species: 'Betta' });
	});
});
