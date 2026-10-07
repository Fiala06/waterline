// Time ranges on the Charts screen: the short label for the picker on phones, the long one on desktop.
export const CHART_RANGES = [
	{ key: '2w', label: '2W', long: '2 weeks', days: 14 },
	{ key: '1m', label: '1M', long: '30 days', days: 30 },
	{ key: '3m', label: '3M', long: '90 days', days: 91 },
	{ key: '1y', label: '1Y', long: '1 year', days: 365 },
	{ key: 'all', label: 'All', long: 'All', days: 0 }
] as const;

/**
 * The range a parameter's chart draws (#74): the readings, and room past the
 * target on both sides, so the target is a band and never the whole chart.
 * - min 0 (ammonia, nitrite): from 0 up to twice the limit, or past the highest reading
 * - min and max: about half the target's width above and below, down to 0 at most
 * - only one limit: half of it again past it
 * - no target: the readings with a little padding
 * Readings below 0 (a sensor offset) stay in view.
 */
export function chartDomain(values: number[], band: { min: number | null; max: number | null }): { lo: number; hi: number } {
	const vals = values.filter((v) => Number.isFinite(v));
	const vLo = vals.length ? Math.min(...vals) : null;
	const vHi = vals.length ? Math.max(...vals) : null;
	const { min, max } = band;
	let lo: number;
	let hi: number;
	if (min === 0 && max != null && max > 0) {
		lo = 0;
		hi = Math.max(max * 2, (vHi ?? 0) * 1.1);
	} else if (min != null && max != null && max > min) {
		const span = max - min;
		lo = Math.min(min - span * 0.45, vLo != null ? vLo - span * 0.1 : Infinity);
		hi = Math.max(max + span * 0.45, vHi != null ? vHi + span * 0.1 : -Infinity);
	} else if (max != null && max > 0) {
		lo = Math.min(0, vLo ?? 0);
		hi = Math.max(max * 1.5, (vHi ?? 0) * 1.1);
	} else if (min != null && min > 0) {
		lo = Math.min(min * 0.5, vLo != null ? vLo - min * 0.1 : Infinity);
		hi = Math.max(min * 1.5, vHi != null ? vHi + min * 0.1 : -Infinity);
	} else {
		if (vLo == null || vHi == null) return { lo: 0, hi: 1 };
		const pad = vHi > vLo ? (vHi - vLo) * 0.12 : Math.max(1, Math.abs(vHi) * 0.1);
		lo = vLo - pad;
		hi = vHi + pad;
	}
	// nothing below 0 unless a reading is
	if (lo < 0 && (vLo == null || vLo >= 0)) lo = 0;
	if (vLo != null && vLo < lo) lo = vLo;
	if (!(hi > lo)) hi = lo + 1;
	return { lo, hi };
}

// Event overlays on Charts (#88): which tank events draw a marker, each kind
// on its own switch. Water changes show by default; the rest are opt-in so a
// beginner's chart stays clear.
export type OverlayKind = 'water_change' | 'dosing' | 'co2' | 'light' | 'trim' | 'maintenance' | 'algae';
export const OVERLAYS: { kind: OverlayKind; label: string; default: boolean }[] = [
	{ kind: 'water_change', label: 'Water change', default: true },
	{ kind: 'dosing', label: 'Dosing', default: false },
	{ kind: 'co2', label: 'CO₂ change', default: false },
	{ kind: 'light', label: 'Light change', default: false },
	{ kind: 'trim', label: 'Plant trim', default: false },
	{ kind: 'maintenance', label: 'Maintenance', default: false },
	{ kind: 'algae', label: 'Algae', default: false }
];
export const OVERLAY_LABEL = Object.fromEntries(OVERLAYS.map((o) => [o.kind, o.label])) as Record<OverlayKind, string>;
export const DEFAULT_OVERLAYS = Object.fromEntries(OVERLAYS.map((o) => [o.kind, o.default])) as Record<OverlayKind, boolean>;

/** The type of the equipment an entry names: by id while the item exists, by its name after, by the name's words last. */
export function equipmentTypeLookup(items: { id: string; name: string; type: string }[]): (id: unknown, item: unknown) => string | null {
	const byId = new Map(items.map((i) => [i.id, i.type]));
	const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i.type]));
	return (id, item) => {
		if (typeof id === 'string' && byId.has(id)) return byId.get(id)!;
		const name = typeof item === 'string' ? item.trim().toLowerCase() : '';
		if (byName.has(name)) return byName.get(name)!;
		if (/co₂|co2/.test(name)) return 'co2';
		if (/\b(light|led|lamp)\b/.test(name)) return 'light';
		return null;
	};
}

/** Which overlay an event belongs to; null for the kinds that never draw a marker. */
export function overlayKind(e: { category: string; data: Record<string, unknown> }, equipmentType: (id: unknown, item: unknown) => string | null): OverlayKind | null {
	switch (e.category) {
		case 'water_change':
			return 'water_change';
		case 'dosing':
			return 'dosing';
		case 'maintenance': {
			const actions = Array.isArray(e.data.actions) ? (e.data.actions as unknown[]) : [];
			return actions.includes('Trimmed plants') ? 'trim' : 'maintenance';
		}
		case 'equipment': {
			const type = equipmentType(e.data.equipment_id, e.data.item);
			return type === 'co2' ? 'co2' : type === 'light' ? 'light' : null;
		}
		case 'observation':
			// algae logged on the tank (#86); other observations stay off the chart
			return e.data.kind === 'algae' ? 'algae' : null;
		default:
			return null;
	}
}

// Comparing parameters (#87): up to two more on the same chart, each on its
// own scale (a dashed line, the first with an axis on the right), named in
// the address as ?c=id,id so a comparison can be shared.
export const MAX_COMPARE = 2;

/** The parameters to draw beside the main one: known ids, not the main one, no repeats, at most MAX_COMPARE. */
export function parseCompare(raw: string | null, ids: string[], primary: string): string[] {
	if (!raw) return [];
	const out: string[] = [];
	for (const id of raw.split(',').map((s) => s.trim())) {
		if (id && id !== primary && ids.includes(id) && !out.includes(id)) out.push(id);
		if (out.length >= MAX_COMPARE) break;
	}
	return out;
}
