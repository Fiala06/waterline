// The event form's logic (#120): dosing's product list and hint, the count
// stepper, the livestock preview, the title and button. Pure, so
// EventForm.svelte only wires it up, and event-form.test.ts covers it.
import { CATEGORY_LABEL } from '$lib/events';
import type { EventCategory } from '$lib/types';

export interface RecentDose {
	product: string;
	amount: unknown;
	unit: unknown;
	at: string;
}

/** The products to pick from: recent doses first, then saved products, each name once (any case). */
export function productChoices(recent: RecentDose[], saved: { name: string }[]): string[] {
	const seen = new Set<string>();
	return [...recent.map((r) => r.product), ...saved.map((l) => l.name.trim())].filter((n) => {
		const k = n.toLowerCase();
		if (!n || seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

/** The last dose of this product, whatever its case. */
export const lastDoseOf = (recent: RecentDose[], product: string) => recent.find((r) => r.product.toLowerCase() === product.trim().toLowerCase());

/** "Last dosed 5 mL on Oct 3. Recent products are listed first." */
export function doseHint(recent: RecentDose[], product: string, choices: number, timeZone: string): string {
	const last = lastDoseOf(recent, product);
	const fmt = (r: RecentDose) =>
		`Last dosed ${r.amount ?? ''} ${r.unit ?? ''} on ${new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}.`.replace(/\s+/g, ' ');
	return [last ? fmt(last) : '', recent.length && choices > recent.length ? 'Recent products are listed first.' : ''].filter(Boolean).join(' ');
}

/** The count after a − or + tap: from blank it starts at the least, and stays within min and max. */
export function stepCount(count: string, delta: number, min: number, max: number | null): string {
	const n0 = parseInt(count, 10);
	let n = (Number.isNaN(n0) ? (delta > 0 ? min - 1 : min + 1) : n0) + delta;
	n = Math.max(min, n);
	if (max != null) n = Math.min(max, n);
	return String(n);
}

export interface Animal {
	id: string;
	name: string;
	count: number;
	status?: string;
	scientific?: string | null;
}

/**
 * What adding or removing livestock does to the counts, before saving:
 * "Neon tetra 6 → 10 · 24 in the tank". Adding matches one already in the
 * tank (same status) by scientific name, else by name; null when there's
 * nothing to preview.
 */
export function livestockPreview(
	livestock: Animal[],
	o: { action: string; kind: string; status: string; count: string; species: { name: string; scientific: string }; target?: Animal }
): { name: string; from: number; to: number; total: number } | null {
	const n = parseInt(o.count, 10);
	if (!(n > 0)) return null;
	const total = livestock.reduce((s, l) => s + l.count, 0);
	if (o.action === 'added' && o.kind !== 'plant' && o.species.name) {
		const same = livestock.find(
			(l) =>
				(l.status ?? 'in_tank') === o.status &&
				(o.species.scientific && l.scientific ? l.scientific === o.species.scientific : l.name.toLowerCase() === o.species.name.toLowerCase())
		);
		const from = same?.count ?? 0;
		return { name: same?.name ?? o.species.name, from, to: from + n, total: total + n };
	}
	if (o.action === 'removed' && o.target && n <= o.target.count) {
		return { name: o.target.name, from: o.target.count, to: o.target.count - n, total: total - n };
	}
	return null;
}

const SAVE: Record<EventCategory, string> = {
	water_change: 'Save water change',
	dosing: 'Save dosing',
	feeding: 'Save feeding',
	maintenance: 'Save maintenance',
	livestock: 'Save change',
	equipment: 'Save equipment change',
	observation: 'Save observation',
	note: 'Save note',
	health: 'Save health entry'
};

/** The form's Save button. */
export const eventSaveLabel = (mode: 'new' | 'edit', category: EventCategory) => (mode === 'edit' ? 'Save changes' : SAVE[category]);

/** "Log a dose", "Add note or photo", "Edit water change" */
export function eventTitle(mode: 'new' | 'edit', category: EventCategory): string {
	const label = CATEGORY_LABEL[category].toLowerCase();
	if (mode === 'edit') return `Edit ${label}`;
	if (category === 'note') return 'Add note or photo';
	if (category === 'dosing') return 'Log a dose';
	return `Log ${label}`;
}
