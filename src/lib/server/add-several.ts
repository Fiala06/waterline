// Add several (bulk add): livestock or plants picked from the species list,
// each with its count or place, saved in one go. It's saved as an import with
// no file, so the toast's Undo (and Recent imports) take the whole lot back.
import { parseSeveralList } from '$lib/several';
import { todayInZone } from '$lib/time';
import type { User } from './db/schema';
import { applyImport } from './import';
import { validValue, type LivestockValue, type PlantValue } from './import-rows';
import { exactSpecies } from './species';

export type SeveralList = 'livestock' | 'plants';

/**
 * Without scripts: one per line, read as the page reads it ("6 Neon tetra",
 * "Java fern", "Otocinclus x 5", "Amano shrimp, 3"). Names the species list
 * knows get their scientific name and kind.
 */
export function linesToValues(list: SeveralList, text: string, water: 'fresh' | 'marine' | null, opts: { status: 'in_tank' | 'quarantine'; added: string }) {
	const out: (LivestockValue | PlantValue)[] = [];
	for (const { name, count } of parseSeveralList(text)) {
		const known = exactSpecies(name, water);
		const sp = known?.species ?? null;
		if (list === 'plants') out.push({ name, scientific: sp?.s ?? null, position: 'midground', status: 'thriving', added: opts.added });
		else {
			const kind = known?.kind === 'invert' || known?.kind === 'coral' ? known.kind : 'fish';
			out.push({ kind, name, scientific: sp?.s ?? null, count, added: opts.added, status: opts.status, source: null });
		}
	}
	return out;
}

/** Check what the page sent and add it all. Null when there's nothing, or something's off. */
export function addSeveral(list: SeveralList, form: FormData, user: User, tankId: string, water: 'fresh' | 'marine' | null) {
	const today = todayInZone(user.timeZone);
	const added = String(form.get('addedAt') ?? '') || today;
	const status = form.get('status') === 'quarantine' ? 'quarantine' : 'in_tank';
	const source = String(form.get('source') ?? '').trim().slice(0, 120) || null;
	let values: unknown[] = form.getAll('row').map((raw) => {
		try {
			return JSON.parse(String(raw));
		} catch {
			return null;
		}
	});
	const lines = String(form.get('lines') ?? '');
	if (!values.length && lines.trim()) values = linesToValues(list, lines, water, { status, added });
	if (!values.length) return { error: list === 'plants' ? 'Pick at least one plant.' : 'Pick at least one species.' };
	// the date, status and source apply to all of them
	const shared = list === 'livestock' ? { added, status, source } : { added };
	const checked = values.map((v) => (v && typeof v === 'object' ? validValue(list, { ...v, ...shared }, today) : null));
	if (checked.some((v) => !v)) return { error: list === 'plants' ? 'Check each plant: a name, and where it is.' : 'Check each species: a name, and how many (1 or more).' };
	const ok = checked as (LivestockValue | PlantValue)[];
	const { importId } = applyImport(list, ok, user, tankId, { reminders: false, fileName: null });
	const animals = list === 'livestock' ? (ok as LivestockValue[]).reduce((n, l) => n + l.count, 0) : 0;
	const message =
		list === 'livestock'
			? `✓ Added ${animals} animal${animals === 1 ? '' : 's'} · ${ok.length} species`
			: `✓ Added ${ok.length} plant${ok.length === 1 ? '' : 's'}`;
	return { importId, message };
}
