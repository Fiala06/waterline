// Search the bundled species list (for livestock/plant autocomplete, milestone 12).
import data from './data/species.json';
import fixes from './data/species-fixes.json';

export interface Species {
	s: string; // scientific name
	c: string[]; // common names; the first is the one saved
	kind: 'fish' | 'invert' | 'coral' | 'plant';
	water: 'fresh' | 'marine';
}

/**
 * species.json with the hand-kept fixes (species-fixes.json): entries that
 * aren't species and junk names out, garbled names corrected, hobby names
 * added ("Horned nerite snail"), and popular species the sources lack.
 */
function curated(): Species[] {
	const drop = new Set<string>(fixes.drop);
	const junk = new Set(fixes.dropNames.map((n) => n.toLowerCase()));
	const replace: Record<string, string[]> = fixes.replace;
	const names: Record<string, string[]> = fixes.names;
	const kind = fixes.kind as Record<string, Species['kind']>;
	const list = (data.species as Species[])
		.filter((sp) => !drop.has(sp.s))
		.map((sp) => {
			const own = (replace[sp.s] ?? sp.c).filter((n) => !junk.has(n.toLowerCase()));
			const extra = (names[sp.s] ?? []).filter((n) => !own.includes(n));
			return { ...sp, kind: kind[sp.s] ?? sp.kind, c: [...own, ...extra] };
		});
	const have = new Set(list.map((sp) => sp.s));
	return [...list, ...(fixes.add as Species[]).filter((sp) => !have.has(sp.s))];
}

const species = curated();

// Lowercase, no accents, no apostrophes, and any other punctuation as a space:
// "Rummy-nose" is "rummy nose", "Denison's" is "denisons", "Süsswassertang" is "susswassertang".
const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/['’]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

interface Key {
	text: string;
	words: string[];
	compact: string; // without spaces: "firefish" finds "Fire fish"
	name: string | null; // the common name, null for the scientific one
}
const key = (text: string, name: string | null): Key => {
	const t = norm(text);
	return { text: t, words: t.split(' '), compact: t.replace(/ /g, ''), name };
};
const index = species.map((sp) => ({ sp, keys: [...sp.c.map((n) => key(n, n)), key(sp.s, null)] }));

/** How well a name matches: whole name, then its start, then word starts, then run together, then anywhere. Common names rank above scientific ones. */
function score(k: Key, q: string, words: string[], compact: string) {
	const common = k.name != null;
	if (k.text === q) return common ? 60 : 55;
	if (k.text.startsWith(q)) return common ? 50 : 35;
	if (words.every((w) => k.words.some((kw) => kw.startsWith(w)))) return common ? 40 : 30;
	if (k.compact.startsWith(compact)) return 20;
	if (k.text.includes(q)) return 10;
	return 0;
}

/**
 * Best matches first, optionally limited to fresh or marine; `kind` 'invert'
 * includes corals, 'animal' is everything but plants, and filtering happens before the limit. The name that
 * matched comes first in `c`, so it's the one shown and saved ("Blue velvet
 * shrimp" rather than "Cherry shrimp").
 */
export function searchSpecies(
	query: string,
	opts: { water?: 'fresh' | 'marine'; kind?: Species['kind'] | 'animal'; limit?: number } = {}
): Species[] {
	const q = norm(query);
	if (q.length < 2) return [];
	const words = q.split(' ');
	const compact = q.replace(/ /g, '');
	const kindOk = (k: Species['kind']) =>
		!opts.kind || k === opts.kind || (opts.kind === 'invert' && k === 'coral') || (opts.kind === 'animal' && k !== 'plant');
	const scored: { sp: Species; score: number; name: string | null }[] = [];
	for (const { sp, keys } of index) {
		if ((opts.water && sp.water !== opts.water) || !kindOk(sp.kind)) continue;
		let best = 0;
		let name: string | null = null;
		for (const k of keys) {
			const s = score(k, q, words, compact);
			if (s > best) [best, name] = [s, k.name];
		}
		if (best) scored.push({ sp, score: best, name });
	}
	return scored
		.sort((a, b) => b.score - a.score || Number(!a.sp.c.length) - Number(!b.sp.c.length) || a.sp.s.localeCompare(b.sp.s))
		.slice(0, opts.limit ?? 10)
		.map(({ sp, name }) => (name && name !== sp.c[0] ? { ...sp, c: [name, ...sp.c.filter((n) => n !== name)] } : sp));
}

/**
 * What a name exactly is (a common or scientific name, ignoring case, accents
 * and punctuation), for imports. Common names and the tank's water count first.
 * A name several species share ("Nerite snail") gives only their kind, if they
 * share one.
 */
export function exactSpecies(name: string, water?: 'fresh' | 'marine' | null) {
	const q = norm(name);
	if (q.length < 2) return null;
	const found: { sp: Species; rank: number }[] = [];
	for (const { sp, keys } of index) {
		const k = keys.find((k) => k.text === q);
		if (k) found.push({ sp, rank: (k.name != null ? 2 : 0) + (water && sp.water === water ? 1 : 0) });
	}
	if (!found.length) return null;
	const top = Math.max(...found.map((f) => f.rank));
	const best = found.filter((f) => f.rank === top);
	const kinds = new Set(best.map((f) => f.sp.kind));
	return {
		species: best.length === 1 ? best[0].sp : null,
		kind: kinds.size === 1 ? best[0].sp.kind : null
	};
}

export const speciesCount = species.length;
