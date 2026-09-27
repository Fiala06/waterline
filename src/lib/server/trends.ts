// What stands out about a tank's readings, the same wherever it's shown (the
// dashboard, the summary for an AI assistant, the digest email): runs and
// paces, drifts between water changes, and changes after a dose.
import { patternNotes, trendNote, type TrendNote } from '$lib/trends';
import type { UnitPrefs } from '$lib/units';
import { eventsSince, lastEventOf, series } from './logs';
import { listParams } from './tanks';

/** How far back to look. */
export const NOTE_DAYS = 90;
const ORDER: Record<TrendNote['kind'], number> = { run: 0, drift: 1, dose: 2 };

/** A tank's notes, most urgent first (heading for a limit), then runs, drifts and doses. */
export function tankNotes(tankId: string, prefs: UnitPrefs, opts: { limit?: number; now?: number } = {}): TrendNote[] {
	const now = opts.now ?? Date.now();
	const since = new Date(now - NOTE_DAYS * 86_400_000).toISOString();
	const lastWc = lastEventOf(tankId, 'water_change');
	const waterChanges = eventsSince(tankId, ['water_change'], since).map((e) => Date.parse(e.occurredAt));
	const doses = eventsSince(tankId, ['dosing'], since)
		.filter((e) => typeof e.data.product === 'string' && e.data.product.trim())
		.map((e) => ({ t: Date.parse(e.occurredAt), product: String(e.data.product) }));
	return listParams(tankId)
		.flatMap((p) => {
			const points = series(tankId, p.id, since).map((r) => ({ t: Date.parse(r.takenAt), value: r.value }));
			const run = trendNote(p, points, { prefs, since: lastWc ? Date.parse(lastWc.occurredAt) : null });
			return [...(run ? [run] : []), ...patternNotes(p, points, { waterChanges, doses }, { prefs })];
		})
		.sort((a, b) => Number(b.warn) - Number(a.warn) || ORDER[a.kind] - ORDER[b.kind])
		.slice(0, opts.limit ?? Infinity);
}
