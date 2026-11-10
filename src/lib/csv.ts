// CSV as spreadsheets save it, for imports and their templates: commas,
// semicolons (Excel where the decimal mark is a comma) or tabs; "quoted"
// cells with "" for a quote and line breaks inside; CRLF or LF; a BOM.

/** Rows of cells, one per record (a blank line is ['']), so row numbers match the spreadsheet's. The delimiter is the one the first line uses most. */
/** What separates a file's cells: the one its first line has most of. */
export function csvDelimiter(text: string): ',' | ';' | '\t' {
	const s = text.replace(/^\uFEFF/, '');
	const first = s.slice(0, s.search(/\r|\n|$/));
	return ([',', ';', '\t'] as const).reduce<',' | ';' | '\t'>((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
}

export function parseCsv(text: string): string[][] {
	const s = text.replace(/^\uFEFF/, '');
	const delim = csvDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quoted) {
			if (c !== '"') cell += c;
			else if (s[i + 1] === '"') {
				cell += '"';
				i++;
			} else quoted = false;
		} else if (c === '"' && cell === '') quoted = true;
		else if (c === delim) {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && s[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	if (cell !== '' || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * A cell of text someone typed (a note, a name), for a file that will be
 * opened in a spreadsheet (#221): one that starts with =, +, -, @, a tab or a
 * return would run as a formula there, so it gets a leading apostrophe, which
 * spreadsheets show as text. A number ("-0.5") is left as it is. Quoted as
 * any cell is. `unguardCell` takes the apostrophe off again on import.
 */
export const safeCell = (v: string) => cell(/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v);

/** A cell as it was before safeCell guarded it: "'=1+1" is "=1+1". Anything else is untouched. */
export const unguardCell = (v: string) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

/** A CSV file, with a BOM so Excel reads it as UTF-8 ("°F", "CO₂"). */
export function toCsv(rows: string[][]): string {
	return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
