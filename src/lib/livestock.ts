// Livestock with pets among it: a named pet is its own entry (one animal)
// beside its species' group, so lists put them together and count species once.

interface Animal {
	commonName: string;
	scientificName: string | null;
	nickname?: string | null;
}

/** One key per species, whatever its entries are called. */
export const speciesKey = (l: Animal) => (l.scientificName || l.commonName).trim().toLowerCase();

/** "Captain · Betta" for a pet, the species for a group. */
export const livestockLabel = (l: Animal) => (l.nickname ? `${l.nickname} · ${l.commonName}` : l.commonName);

/** How many species, not entries. */
export const speciesCount = (rows: Animal[]) => new Set(rows.map(speciesKey)).size;

/**
 * Each species' group, then its pets by name, in the order the species were
 * first added.
 */
export function bySpecies<T extends Animal>(rows: T[]): T[] {
	const first = new Map<string, number>();
	rows.forEach((l, i) => first.has(speciesKey(l)) || first.set(speciesKey(l), i));
	return rows
		.map((l, i) => ({ l, i }))
		.sort(
			(a, b) =>
				first.get(speciesKey(a.l))! - first.get(speciesKey(b.l))! ||
				Number(!!a.l.nickname) - Number(!!b.l.nickname) ||
				(a.l.nickname ?? '').localeCompare(b.l.nickname ?? '') ||
				a.i - b.i
		)
		.map(({ l }) => l);
}
