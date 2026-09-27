// Imports from a spreadsheet (shared by the pages and the server): each kind's
// address under /tanks/[id]/import/, what one row is, and where its entries
// show once imported.
import type { ImportKind } from './types';

export interface ImportInfo {
	/** /tanks/[id]/import/<slug> */
	slug: string;
	/** "Import water tests" */
	title: string;
	/** its chip: "Water tests" */
	label: string;
	/** "Add one row per water test" */
	per: string;
	/** what's counted: "3 water tests", "12 animals" */
	one: string;
	many: string;
	/** the History filter its entries show under; lists go back to their tab */
	cat: 'test' | 'water_change' | 'dosing' | 'maintenance' | 'observation' | 'note' | null;
}

export const IMPORTS: Record<ImportKind, ImportInfo> = {
	livestock: { slug: 'livestock', title: 'Import livestock', label: 'Livestock', per: 'species', one: 'animal', many: 'animals', cat: null },
	plants: { slug: 'plants', title: 'Import plants', label: 'Plants', per: 'plant', one: 'plant', many: 'plants', cat: null },
	equipment: { slug: 'equipment', title: 'Import equipment', label: 'Equipment', per: 'piece of equipment', one: 'item', many: 'items', cat: null },
	tests: { slug: 'tests', title: 'Import water tests', label: 'Water tests', per: 'water test', one: 'water test', many: 'water tests', cat: 'test' },
	water_changes: { slug: 'water-changes', title: 'Import water changes', label: 'Water changes', per: 'water change', one: 'water change', many: 'water changes', cat: 'water_change' },
	dosing: { slug: 'dosing', title: 'Import dosing', label: 'Dosing', per: 'dose', one: 'dose', many: 'doses', cat: 'dosing' },
	maintenance: { slug: 'maintenance', title: 'Import maintenance', label: 'Maintenance', per: 'maintenance entry', one: 'maintenance entry', many: 'maintenance entries', cat: 'maintenance' },
	observations: { slug: 'observations', title: 'Import observations', label: 'Observations', per: 'observation', one: 'observation', many: 'observations', cat: 'observation' },
	notes: { slug: 'notes', title: 'Import notes', label: 'Notes', per: 'note', one: 'note', many: 'notes', cat: 'note' },
	// one file with several kinds of entry, each row's kind in its Type column
	history: { slug: 'history', title: 'Import several kinds', label: 'Several kinds', per: 'entry', one: 'entry', many: 'entries', cat: null }
};

export const HISTORY_IMPORTS = ['tests', 'water_changes', 'dosing', 'maintenance', 'observations', 'notes'] as const satisfies readonly ImportKind[];
/** A kind of History entry a file can hold. */
export type HistoryKind = (typeof HISTORY_IMPORTS)[number];
/** A History file: one kind of entry, or several (`history`, read from a Type column). */
export const HISTORY_FILES = [...HISTORY_IMPORTS, 'history'] as const satisfies readonly ImportKind[];
export type HistoryFile = (typeof HISTORY_FILES)[number];

export const isHistoryKind = (k: ImportKind): k is HistoryFile => (HISTORY_FILES as readonly string[]).includes(k);

export function importKindOf(slug: string): ImportKind | null {
	for (const [kind, info] of Object.entries(IMPORTS)) if (info.slug === slug) return kind as ImportKind;
	return null;
}

/** The import a History filter leads to: a water test file for "Water tests", the Livestock list's for "Livestock / plants". */
export function importForFilter(cat: string): ImportKind {
	if (cat === 'livestock') return 'livestock';
	if (cat === 'equipment') return 'equipment';
	return HISTORY_IMPORTS.find((k) => IMPORTS[k].cat === cat) ?? 'tests';
}

/** "1 water test", "1,250 water tests" */
export const countOf = (kind: ImportKind, n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? IMPORTS[kind].one : IMPORTS[kind].many}`;
