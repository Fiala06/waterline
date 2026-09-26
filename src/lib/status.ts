// Parameter status against a tank's target range. See README → Parameter status.
//
// - out of range ("bad") if v < min or v > max
// - near limit ("warn") if in range and within 10% of (max − min) of a bound,
//   only when min > 0 (ammonia/nitrite with min 0 are never "near")
// - in range ("ok") otherwise; "none" when there is no reading
//
// Status is never color-only: always pair `level` with `statusIcon` + label.

export type StatusLevel = 'ok' | 'warn' | 'bad' | 'none';
export type StatusDirection = 'low' | 'high' | null;

export interface Status {
	level: StatusLevel;
	direction: StatusDirection;
}

export interface Range {
	min: number | null;
	max: number | null;
}

export const NEAR_FRACTION = 0.1;

// Small tolerance so a value that round-trips through unit conversion
// (e.g. 80 °F → 26.666…°C → 80 °F) is not flagged for floating-point noise.
const EPS = 1e-9;

export function paramStatus(value: number | null | undefined, range: Range): Status {
	if (value == null || Number.isNaN(value)) return { level: 'none', direction: null };
	const { min, max } = range;
	if (min != null && value < min - EPS) return { level: 'bad', direction: 'low' };
	if (max != null && value > max + EPS) return { level: 'bad', direction: 'high' };
	if (min != null && max != null && min > 0 && max > min) {
		const margin = (max - min) * NEAR_FRACTION;
		if (value - min < margin - EPS) return { level: 'warn', direction: 'low' };
		if (max - value < margin - EPS) return { level: 'warn', direction: 'high' };
	}
	return { level: 'ok', direction: null };
}

export const statusIcon: Record<StatusLevel, string> = { ok: '✓', warn: '▲', bad: '✕', none: '–' };

/** Short label for cards: "✓ OK", "▲ Near low", "✕ High", "– No data". */
export function statusShort(s: Status): string {
	switch (s.level) {
		case 'ok':
			return '✓ OK';
		case 'warn':
			return s.direction === 'high' ? '▲ Near high' : '▲ Near low';
		case 'bad':
			return s.direction === 'high' ? '✕ High' : '✕ Low';
		default:
			return '– No data';
	}
}

/** Label for entry detail and edit forms: "✓ In range", "▲ Near limit", "✕ High". */
export function statusMedium(s: Status): string {
	switch (s.level) {
		case 'ok':
			return '✓ In range';
		case 'warn':
			return '▲ Near limit';
		case 'bad':
			return s.direction === 'high' ? '✕ High' : '✕ Low';
		default:
			return '– No data';
	}
}

/** Inline form message: "✕ Above target 5–20 ppm", "▲ Near limit · 2–5 dKH". */
export function statusLong(s: Status, rangeText: string): string {
	switch (s.level) {
		case 'ok':
			return '✓ In range';
		case 'warn':
			return `▲ Near limit · ${rangeText}`;
		case 'bad':
			return `✕ ${s.direction === 'high' ? 'Above' : 'Below'} target ${rangeText}`;
		default:
			return '';
	}
}

/**
 * Human range text in display units: "5–20 ppm", "≤ 0.25 ppm", "≥ 2 dKH",
 * or "" when there is no target.
 */
export function rangeText(
	min: string | null,
	max: string | null,
	unit: string,
	minIsZero = false
): string {
	const u = unit ? ` ${unit}` : '';
	if (max != null && (min == null || minIsZero)) return `≤ ${max}${u}`;
	if (min != null && max == null) return `≥ ${min}${u}`;
	if (min != null && max != null) return `${min}–${max}${u}`;
	return '';
}
