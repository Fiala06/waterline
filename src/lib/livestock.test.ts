import { describe, expect, it } from 'vitest';
import { bySpecies, livestockLabel, speciesCount, speciesKey } from './livestock';

const cory = { commonName: 'Corydoras', scientificName: 'Corydoras paleatus' };
const betta = { commonName: 'Betta', scientificName: 'Betta splendens' };
const tetra = { commonName: 'Neon tetra', scientificName: null };

describe('livestock with pets', () => {
	it('labels a pet with its species', () => {
		expect(livestockLabel({ ...betta, nickname: 'Captain' })).toBe('Captain · Betta');
		expect(livestockLabel(tetra)).toBe('Neon tetra');
	});

	it('counts a species once, however many pets it has', () => {
		expect(speciesCount([cory, { ...cory, nickname: 'Pepper' }, { ...cory, nickname: 'Salt' }, tetra])).toBe(2);
		expect(speciesKey({ commonName: ' Neon Tetra ', scientificName: null })).toBe('neon tetra');
	});

	it('lists each group, then its pets by name, species in the order added', () => {
		const rows = [
			{ ...cory, nickname: 'Salt' },
			tetra,
			{ ...betta, nickname: 'Captain' },
			cory,
			{ ...cory, nickname: 'Pepper' }
		];
		expect(bySpecies(rows).map(livestockLabel)).toEqual(['Corydoras', 'Pepper · Corydoras', 'Salt · Corydoras', 'Neon tetra', 'Captain · Betta']);
	});
});
