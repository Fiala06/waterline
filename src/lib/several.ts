// Add several's pasted list (#120): one parser for the page (as you type)
// and the server (without scripts), so both read a line the same way.

export interface SeveralLine {
	name: string;
	count: number;
}

/** One line: `6 Neon tetra`, `6x Neon tetra`, `Otocinclus x 5`, `Amano shrimp, 3`, or a name alone (1). */
export function parseSeveralLine(line: string): SeveralLine | null {
	const t = line.trim().replace(/\s+/g, ' ');
	if (!t) return null;
	let m = t.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
	if (m) return tidy(m[2], Number(m[1]));
	m = t.match(/^(.+?)\s*(?:[x×]\s*|,\s*)(\d+)$/i);
	if (m) return tidy(m[1], Number(m[2]));
	return tidy(t, 1);
}

/** Every line of a pasted list, blank ones skipped. */
export function parseSeveralList(text: string): SeveralLine[] {
	return text
		.split(/\r?\n/)
		.map(parseSeveralLine)
		.filter((p): p is SeveralLine => !!p);
}

// a name of at most 80 characters, a count from 1 to 999
const tidy = (name: string, count: number): SeveralLine => ({ name: name.trim().slice(0, 80), count: Math.max(1, Math.min(999, count || 1)) });

/** "Add 3 animals · 2 species", "Add 2 plants", "Add species"; "Add them" without scripts. */
export function severalSaveLabel(js: boolean, plants: boolean, items: number, animals: number): string {
	if (!js) return 'Add them';
	if (plants) return `Add ${items || ''} plant${items === 1 ? '' : 's'}`.replace('  ', ' ');
	return items ? `Add ${animals} animal${animals === 1 ? '' : 's'} · ${items} species` : 'Add species';
}
