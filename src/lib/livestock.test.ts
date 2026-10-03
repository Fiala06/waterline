import { describe, expect, it } from 'vitest';
import { bySpecies, healthTitle, livestockLabel, outcomeText, speciesCount, speciesKey, underTreatment } from './livestock';

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

describe('health entries', () => {
	it('titles an entry for History', () => {
		expect(healthTitle({ names: ['Betta'], symptoms: ['White spots'], outcome: 'treating' })).toBe('Health · Betta · White spots · treating');
		expect(healthTitle({ names: ['Captain · Betta', 'Neon tetra'], symptoms: ['Gasping', 'Lethargic'], outcome: 'recovered' })).toBe('Health · Captain · Betta, Neon tetra · Gasping, Lethargic · recovered');
		expect(healthTitle({ names: ['a', 'b', 'c'], symptoms: [], outcome: 'lost' })).toBe('Health · 3 animals · lost');
		expect(healthTitle({})).toBe('Health · watching');
	});

	it('shows the outcome as glyph and word', () => {
		expect(outcomeText('watching')).toBe('▲ Watching');
		expect(outcomeText('treating')).toBe('▲ Treating');
		expect(outcomeText('recovered')).toBe('✓ Recovered');
		expect(outcomeText('lost')).toBe('✕ Lost');
		expect(outcomeText('nonsense')).toBe('▲ Watching');
	});

	it('flags the animals whose latest entry is still open', () => {
		// newest first
		const entries = [
			{ data: { livestockIds: ['a'], outcome: 'recovered' } },
			{ data: { livestockIds: ['a', 'b'], outcome: 'treating' } },
			{ data: { livestockIds: ['c'], outcome: 'lost' } },
			{ data: { livestockIds: ['d'], outcome: 'watching' } }
		];
		expect([...underTreatment(entries)].sort()).toEqual(['b', 'd']);
		expect(underTreatment([])).toEqual(new Set());
	});
});
