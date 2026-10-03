// Livestock with pets among it: a named pet is its own entry (one animal)
// beside its species' group, so lists put them together and count species once.

interface Animal {
	commonName: string;
	scientificName: string | null;
	nickname?: string | null;
}

/** Keep every livestock entry within the range the UI and imports support. */
export const MAX_LIVESTOCK_COUNT = 10_000;
export const validLivestockCount = (count: unknown): count is number =>
	typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= MAX_LIVESTOCK_COUNT;

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

// ── Health ────────────────────────────────────────────────────────────────
// A health entry is an event with category 'health': which animals, what was
// seen, what's being done, and how it stands. Its data:
// { livestockIds: string[], names: string[], symptoms: string[], treatment: string | null, outcome: HealthOutcome }

export const HEALTH_SYMPTOMS = ['White spots', 'Clamped fins', 'Not eating', 'Gasping', 'Bloating', 'Fin rot', 'Lethargic', 'Scratching', 'Red streaks', 'Other'] as const;

export type HealthOutcome = 'watching' | 'treating' | 'recovered' | 'lost';
export const HEALTH_OUTCOMES: { value: HealthOutcome; label: string; glyph: string }[] = [
	{ value: 'watching', label: 'Watching', glyph: '▲' },
	{ value: 'treating', label: 'Treating', glyph: '▲' },
	{ value: 'recovered', label: 'Recovered', glyph: '✓' },
	{ value: 'lost', label: 'Lost', glyph: '✕' }
];

export const isHealthOutcome = (v: unknown): v is HealthOutcome => HEALTH_OUTCOMES.some((o) => o.value === v);

/** "▲ Treating", "✓ Recovered", "✕ Lost": never the glyph alone. */
export function outcomeText(outcome: unknown): string {
	const o = HEALTH_OUTCOMES.find((o) => o.value === outcome) ?? HEALTH_OUTCOMES[0];
	return `${o.glyph} ${o.label}`;
}

/** Still being watched or treated. */
export const outcomeOpen = (outcome: unknown) => outcome === 'watching' || outcome === 'treating';

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** The title History shows: "Health · Betta · White spots · treating". */
export function healthTitle(data: Record<string, unknown>): string {
	const names = strs(data.names);
	const symptoms = strs(data.symptoms);
	const who = names.length > 2 ? `${names.length} animals` : names.join(', ');
	const outcome = HEALTH_OUTCOMES.find((o) => o.value === data.outcome)?.label.toLowerCase() ?? 'watching';
	return ['Health', who, symptoms.join(', '), outcome].filter(Boolean).join(' · ');
}

/**
 * Which animals are under treatment: those whose latest health entry (newest
 * first) is still watching or treating.
 */
export function underTreatment(entries: { data: Record<string, unknown> }[]): Set<string> {
	const seen = new Set<string>();
	const open = new Set<string>();
	for (const e of entries) {
		for (const id of strs(e.data.livestockIds)) {
			if (seen.has(id)) continue;
			seen.add(id);
			if (outcomeOpen(e.data.outcome)) open.add(id);
		}
	}
	return open;
}
