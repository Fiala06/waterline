// Plant health (#85) and algae (#86): dated observations, each an event with
// category 'observation' and a kind, so History and backups carry them.
// Plant: { kind: 'plant', plant_ids, plants: [names], observation, tags: [] }
// Algae: { kind: 'algae', algae, severity, area?, tags: ['Algae'] }

export type PlantStatus = 'thriving' | 'melting' | 'algae' | 'other';

/** What a plant is doing, each with the status it leaves the plant in (none: removed). */
export const PLANT_OBSERVATIONS = [
	{ value: 'thriving', label: 'Thriving', glyph: '✓', status: 'thriving' },
	{ value: 'new_growth', label: 'New growth', glyph: '✓', status: 'thriving' },
	{ value: 'melting', label: 'Melting', glyph: '▲', status: 'melting' },
	{ value: 'yellowing', label: 'Yellowing', glyph: '▲', status: 'melting' },
	{ value: 'pinholes', label: 'Pinholes', glyph: '▲', status: 'melting' },
	{ value: 'algae', label: 'Algae on it', glyph: '▲', status: 'algae' },
	{ value: 'stunted', label: 'Stunted', glyph: '▲', status: 'melting' },
	{ value: 'removed', label: 'Removed', glyph: '✕', status: null },
	{ value: 'other', label: 'Other', glyph: '–', status: 'other' }
] as const satisfies readonly { value: string; label: string; glyph: string; status: PlantStatus | null }[];
export type PlantObservation = (typeof PLANT_OBSERVATIONS)[number]['value'];
export const isPlantObservation = (v: unknown): v is PlantObservation => PLANT_OBSERVATIONS.some((o) => o.value === v);

/** "▲ Pinholes": never the glyph alone. */
export function plantObservationText(v: unknown): string {
	const o = PLANT_OBSERVATIONS.find((o) => o.value === v) ?? PLANT_OBSERVATIONS[PLANT_OBSERVATIONS.length - 1];
	return `${o.glyph} ${o.label}`;
}

/** The status a plant is left in; null when it was removed. */
export function plantStatusAfter(v: PlantObservation): PlantStatus | null {
	const o = PLANT_OBSERVATIONS.find((o) => o.value === v);
	return o ? o.status : 'other';
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** The title History shows: "Ludwigia · pinholes", "3 plants · melting". */
export function plantHealthTitle(data: Record<string, unknown>): string {
	const names = strs(data.plants);
	const who = names.length > 2 ? `${names.length} plants` : names.join(', ');
	const what = PLANT_OBSERVATIONS.find((o) => o.value === data.observation)?.label.toLowerCase() ?? 'noted';
	return [who || 'Plants', what].join(' · ');
}

export const ALGAE_TYPES = ['Green spot', 'Green dust', 'Hair / thread', 'Black beard', 'Staghorn', 'Diatoms / brown', 'Cyanobacteria / BGA', 'Other / unsure'] as const;
export type AlgaeType = (typeof ALGAE_TYPES)[number];
export const isAlgaeType = (v: unknown): v is AlgaeType => ALGAE_TYPES.includes(v as AlgaeType);

export const ALGAE_SEVERITY = [
	{ value: 'light', label: 'A little', glyph: '–' },
	{ value: 'moderate', label: 'Some', glyph: '▲' },
	{ value: 'heavy', label: 'A lot', glyph: '✕' }
] as const;
export type AlgaeSeverity = (typeof ALGAE_SEVERITY)[number]['value'];
export const isAlgaeSeverity = (v: unknown): v is AlgaeSeverity => ALGAE_SEVERITY.some((s) => s.value === v);

/** "▲ Some" */
export function severityText(v: unknown): string {
	const s = ALGAE_SEVERITY.find((s) => s.value === v) ?? ALGAE_SEVERITY[1];
	return `${s.glyph} ${s.label}`;
}

/** The title History shows: "Algae · Black beard · some · on driftwood". */
export function algaeTitle(data: Record<string, unknown>): string {
	const type = typeof data.algae === 'string' ? data.algae : null;
	const sev = ALGAE_SEVERITY.find((s) => s.value === data.severity)?.label.toLowerCase() ?? null;
	const area = typeof data.area === 'string' && data.area ? `on ${data.area}` : null;
	return ['Algae', type, sev, area].filter(Boolean).join(' · ');
}
