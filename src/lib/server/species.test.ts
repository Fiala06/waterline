import { describe, expect, it } from 'vitest';
import { searchSpecies, speciesCount } from './species';

describe('species list', () => {
	it('bundles a couple of thousand species', () => {
		expect(speciesCount).toBeGreaterThan(2000);
	});

	it('finds species by common name', () => {
		expect(searchSpecies('neon tetra')[0].s).toBe('Paracheirodon innesi');
		expect(searchSpecies('amano')[0].s).toBe('Caridina multidentata');
	});

	it('finds species by scientific name', () => {
		expect(searchSpecies('Betta splen')[0].s).toBe('Betta splendens');
	});

	it('filters by fresh or marine water', () => {
		const marine = searchSpecies('clown', { water: 'marine' });
		expect(marine.length).toBeGreaterThan(0);
		expect(marine.every((s) => s.water === 'marine')).toBe(true);
	});

	it('ignores very short queries', () => {
		expect(searchSpecies('a')).toEqual([]);
	});
});
