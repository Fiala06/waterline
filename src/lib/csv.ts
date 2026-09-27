// CSV as spreadsheets save it, for imports and their templates: commas,
// semicolons (Excel where the decimal mark is a comma) or tabs; "quoted"
// cells with "" for a quote and line breaks inside; CRLF or LF; a BOM.

/** Rows of cells, one per record (a blank line is ['']), so row numbers match the spreadsheet's. The delimiter is the one the first line uses most. */
export function parseCsv(text: string): string[][] {
	const s = text.replace(/^\uFEFF/, '');
	const first = s.slice(0, s.search(/\r|\n|$/));
	const delim = [',', ';', '\t'].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
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

/** A CSV file, with a BOM so Excel reads it as UTF-8 ("°F", "CO₂"). */
export function toCsv(rows: string[][]): string {
	return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
