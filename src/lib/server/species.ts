// Search the bundled species list (for livestock/plant autocomplete, milestone 12).
import data from './data/species.json';

export interface Species {
	s: string; // scientific name
	c: string[]; // common names
	kind: 'fish' | 'invert' | 'coral' | 'plant';
	water: 'fresh' | 'marine';
}

const species = data.species as Species[];
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const index = species.map((sp) => ({ sp, keys: [sp.s, ...sp.c].map(norm) }));

/**
 * Best matches first: a name that starts with the query, then a word that
 * starts with it, then any substring. Optionally limited to fresh or marine.
 */
export function searchSpecies(query: string, opts: { water?: 'fresh' | 'marine'; limit?: number } = {}): Species[] {
	const q = norm(query.trim());
	if (q.length < 2) return [];
	const scored: { sp: Species; score: number }[] = [];
	for (const { sp, keys } of index) {
		if (opts.water && sp.water !== opts.water) continue;
		let score = 0;
		for (const k of keys) {
			if (k.startsWith(q)) score = Math.max(score, 3);
			else if (k.split(/[\s-]+/).some((w) => w.startsWith(q))) score = Math.max(score, 2);
			else if (k.includes(q)) score = Math.max(score, 1);
		}
		if (score) scored.push({ sp, score });
	}
	return scored
		.sort((a, b) => b.score - a.score || a.sp.s.localeCompare(b.sp.s))
		.slice(0, opts.limit ?? 10)
		.map((x) => x.sp);
}

export const speciesCount = species.length;
