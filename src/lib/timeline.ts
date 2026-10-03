// The tank timeline (#26): what to say between two photos, and which water
// test speaks for a moment. Pure, so the page and the public page share it.
import { fmtValue, paramUnit, shortName, type ParamLike } from './params';
import type { UnitPrefs } from './units';

export interface TimelineEvent {
	category: string;
	occurredAt: string;
	data: Record<string, unknown>;
}

/** A reading that moved between two moments: "Nitrate 20 → 10 ppm". */
export interface ReadingChange {
	name: string;
	from: string;
	to: string;
	unit: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The index of the test that speaks for a moment: the latest on or before it,
 * else the first after, both within `maxDays`; null when none is near enough.
 * `tests` are oldest first.
 */
export function nearestTest(tests: { takenAt: string }[], at: string, maxDays = 14): number | null {
	const t = Date.parse(at);
	const limit = maxDays * 86_400_000;
	let before: number | null = null;
	for (let i = 0; i < tests.length; i++) {
		const d = Date.parse(tests[i].takenAt) - t;
		if (d <= 0) before = i;
		else {
			if (before != null && t - Date.parse(tests[before].takenAt) <= limit) return before;
			return d <= limit ? i : null;
		}
	}
	return before != null && t - Date.parse(tests[before].takenAt) <= limit ? before : null;
}

/** Readings that read differently between two tests, in the parameters' order. */
export function readingChanges(
	params: (ParamLike & { id: string })[],
	before: Map<string, number>,
	after: Map<string, number>,
	prefs: UnitPrefs,
	max = 3
): ReadingChange[] {
	const out: ReadingChange[] = [];
	for (const p of params) {
		const a = before.get(p.id);
		const b = after.get(p.id);
		if (a == null || b == null) continue;
		const from = fmtValue(p, a, prefs);
		const to = fmtValue(p, b, prefs);
		if (from === to) continue;
		out.push({ name: readingName(p), from, to, unit: paramUnit(p, prefs) });
		if (out.length >= max) break;
	}
	return out;
}

/** "nitrate", but "pH", "TDS", "KH" keep their case. */
function readingName(p: ParamLike) {
	const n = shortName(p);
	return /^[A-Z][a-z]+$/.test(n) ? n.toLowerCase() : n;
}

/**
 * What happened between two photos, short: "+6 Otocinclus · 3 water changes ·
 * trimmed Rotala · nitrate 20 → 10 ppm". Livestock and plants first, then
 * care by count, equipment, and the readings that moved. Notes and feeding
 * don't count; at most `max` parts.
 */
export function gapSummary(events: TimelineEvent[], readings: ReadingChange[] = [], max = 6): string {
	const added = new Map<string, number>();
	const removed = new Map<string, number>();
	const planted: string[] = [];
	const unplanted: string[] = [];
	const trimmed: string[] = [];
	const care = new Map<string, number>();
	const gear: string[] = [];
	let waterChanges = 0;
	let doses = 0;
	let health = 0;
	const add = (set: string[], name: string) => {
		if (name && !set.includes(name)) set.push(name);
	};
	for (const e of events) {
		const d = e.data;
		switch (e.category) {
			case 'water_change':
				waterChanges++;
				break;
			case 'dosing':
				doses++;
				break;
			case 'health':
				health++;
				break;
			case 'livestock': {
				const name = str(d.name);
				if (!name) break;
				if (d.kind === 'plant') {
					add(d.action === 'removed' ? unplanted : planted, name);
					break;
				}
				const n = typeof d.count === 'number' && d.count > 0 ? d.count : 1;
				if (d.action === 'added') added.set(name, (added.get(name) ?? 0) + n);
				else if (d.action === 'removed') removed.set(name, (removed.get(name) ?? 0) + n);
				else if (d.action === 'recount' && typeof d.from === 'number' && typeof d.to === 'number') {
					const diff = d.to - d.from;
					if (diff > 0) added.set(name, (added.get(name) ?? 0) + diff);
					else if (diff < 0) removed.set(name, (removed.get(name) ?? 0) - diff);
				}
				break;
			}
			case 'maintenance': {
				const actions = Array.isArray(d.actions) ? (d.actions as string[]) : [];
				const plants = Array.isArray(d.plants) ? (d.plants as string[]) : [];
				for (const a of actions) {
					// "trimmed Rotala" when the plants are named, else "trimmed plants ×2"
					if (a === 'Trimmed plants' && plants.length) for (const p of plants) add(trimmed, p);
					else care.set(a.toLowerCase(), (care.get(a.toLowerCase()) ?? 0) + 1);
				}
				break;
			}
			case 'equipment': {
				const item = str(d.item);
				if (!item) break;
				if (d.action === 'installed') add(gear, `installed ${item}`);
				else if (d.action === 'replaced') add(gear, `replaced ${item}`);
				else if (d.action === 'removed') add(gear, `removed ${item}`);
				break;
			}
		}
	}
	const parts: string[] = [];
	for (const [name, n] of added) parts.push(`+${n} ${name}`);
	for (const [name, n] of removed) parts.push(`−${n} ${name}`);
	if (planted.length) parts.push(`planted ${planted.join(', ')}`);
	if (unplanted.length) parts.push(`removed ${unplanted.join(', ')}`);
	if (waterChanges) parts.push(plural(waterChanges, 'water change'));
	if (doses) parts.push(plural(doses, 'dose'));
	if (trimmed.length) parts.push(`trimmed ${trimmed.join(', ')}`);
	for (const [what, n] of care) parts.push(n > 1 ? `${what} ×${n}` : what);
	parts.push(...gear);
	if (health) parts.push(plural(health, 'health entry', 'health entries'));
	for (const r of readings) parts.push(`${r.name} ${r.from} → ${r.to}${r.unit ? ` ${r.unit}` : ''}`);
	return parts.slice(0, max).join(' · ');
}

/** "12 days", "1 day", "3 weeks", "2 months": how far apart two photos are. */
export function gapLabel(days: number): string {
	if (days < 1) return 'the same day';
	if (days < 14) return plural(days, 'day');
	if (days < 60) return plural(Math.round(days / 7), 'week');
	if (days < 365) return plural(Math.round(days / 30.4), 'month');
	const y = days / 365.25;
	return y < 2 ? `${Math.round(y * 12)} months` : `${Math.round(y * 10) / 10} years`;
}
