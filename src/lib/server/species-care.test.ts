import { describe, expect, it } from 'vitest';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { parquetReadObjects } from 'hyparquet';
import { buildCare } from './species-care';

const rows = {
	species: [
		{ SpecCode: 10691, Genus: 'Paracheirodon', Species: 'innesi', FBname: 'Neon tetra', Length: 2.5329999923706055 },
		{ SpecCode: 4768, Genus: 'Betta', Species: 'splendens', FBname: 'Siamese fighting fish', Length: 6.5 },
		{ SpecCode: 1, Genus: 'Gadus', Species: 'morhua', FBname: 'Atlantic cod', Length: 200 }
	],
	stocks: [
		{ SpecCode: 10691, Level: 'species in general', TempMin: 20, TempMax: 26, pHMin: 5, pHMax: 7, dHMin: 1, dHMax: 2 },
		{ SpecCode: 4768, Level: 'Mekong', TempMin: null, TempMax: null, pHMin: null, pHMax: null, dHMin: null, dHMax: null },
		{ SpecCode: 4768, Level: 'species in general', TempMin: 24, TempMax: 30, pHMin: 6, pHMax: 8, dHMin: 5, dHMax: 19 },
		{ SpecCode: 1, Level: 'species in general', TempMin: 2, TempMax: 12, pHMin: null, pHMax: null, dHMin: null, dHMax: null }
	],
	ecology: [
		{ SpecCode: 10691, Schooling: -1, Shoaling: 0 },
		{ SpecCode: 4768, Schooling: 0, Shoaling: 0 }
	]
};

describe('buildCare', () => {
	it('keeps the bundled fish only, with the general stock’s ranges and schooling', () => {
		const care = buildCare(rows, new Set(['Paracheirodon innesi', 'Betta splendens']));
		expect(care).toEqual({
			'Paracheirodon innesi': { fb: 'Neon tetra', temp: [20, 26], ph: [5, 7], gh: [1, 2], length: 2.5, school: true },
			'Betta splendens': { fb: 'Siamese fighting fish', temp: [24, 30], ph: [6, 8], gh: [5, 19], length: 6.5, school: null }
		});
	});
	it('finds a species the hobby knows by an older name through FishBase’s synonyms', () => {
		const care = buildCare(
			{
				species: [{ SpecCode: 10926, Genus: 'Hoplisoma', Species: 'paleatum', FBname: 'Peppered corydoras', Length: 5.9 }, ...rows.species],
				synonyms: [
					{ SpecCode: 10926, SynGenus: 'Corydoras', SynSpecies: 'paleatus', Status: 'synonym' },
					{ SpecCode: 63496, SynGenus: 'Corydoras', SynSpecies: 'paleatus', Status: 'misapplied name' },
					{ SpecCode: 10691, SynGenus: 'Paracheirodon', SynSpecies: 'innesi', Status: 'accepted name' }
				],
				stocks: [{ SpecCode: 10926, Level: 'species in general', TempMin: 22, TempMax: 26 }],
				ecology: []
			},
			new Set(['Corydoras paleatus', 'Paracheirodon innesi'])
		);
		expect(care['Corydoras paleatus']).toEqual({ fb: 'Peppered corydoras', temp: [22, 26], ph: null, gh: null, length: 5.9, school: null });
		expect(care['Hoplisoma paleatum']).toBeUndefined();
	});
	it('reads the tables as hyparquet gives them (bigint codes, missing values)', async () => {
		const buf = parquetWriteBuffer({
			columnData: [
				{ name: 'SpecCode', data: [10691n, 4768n], type: 'INT64' },
				{ name: 'TempMin', data: [20, null], type: 'DOUBLE' },
				{ name: 'TempMax', data: [26, null], type: 'DOUBLE' },
				{ name: 'Level', data: ['species in general', 'species in general'], type: 'STRING' }
			]
		});
		const stocks = (await parquetReadObjects({ file: buf })) as never[];
		const care = buildCare({ species: rows.species, stocks, ecology: [] }, new Set(['Paracheirodon innesi', 'Betta splendens']));
		expect(care['Paracheirodon innesi'].temp).toEqual([20, 26]);
		expect(care['Betta splendens']).toEqual({ fb: 'Siamese fighting fish', temp: null, ph: null, gh: null, length: 6.5, school: null });
	});
});
