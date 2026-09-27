import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
	it('reads plain rows, one per record, blank ones included', () => {
		expect(parseCsv('Name,Count\nNeon tetra,12\n\nOtocinclus,4\n')).toEqual([
			['Name', 'Count'],
			['Neon tetra', '12'],
			[''],
			['Otocinclus', '4']
		]);
	});

	it('reads quoted cells with commas, quotes and line breaks', () => {
		expect(parseCsv('Name,Notes\r\n"Fluval 307","Rinse ""bio"" media,\r\nmonthly"\r\n')).toEqual([
			['Name', 'Notes'],
			['Fluval 307', 'Rinse "bio" media,\r\nmonthly']
		]);
	});

	it('keeps a quote inside an unquoted cell', () => {
		expect(parseCsv('Name\n12" tank')).toEqual([['Name'], ['12" tank']]);
	});

	it('finds semicolons and tabs from the first line', () => {
		expect(parseCsv('Name;Count\nNeon tetra;12,5')).toEqual([
			['Name', 'Count'],
			['Neon tetra', '12,5']
		]);
		expect(parseCsv('Name\tCount\nNeon tetra\t12')).toEqual([
			['Name', 'Count'],
			['Neon tetra', '12']
		]);
	});

	it('ignores a BOM and keeps empty cells', () => {
		expect(parseCsv('\uFEFFName,Type,Count\nJava fern,,')).toEqual([
			['Name', 'Type', 'Count'],
			['Java fern', '', '']
		]);
	});

	it('reads back what toCsv writes', () => {
		const rows = [
			['Name', 'Notes'],
			['Tidewell C-400', 'Media: "ceramic", sponge\nRinse monthly'],
			['Heater', '']
		];
		expect(parseCsv(toCsv(rows))).toEqual(rows);
	});
});
