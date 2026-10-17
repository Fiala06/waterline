// The trend chart's arithmetic and words (#120): ticks, which reading is
// nearest, the zones' labels, the readout's status, the keys, the tooltip's
// place. Pure, so TrendChart.svelte draws and wires, and TrendChart.test.ts
// covers these.
import { paramStatus, statusShort } from '$lib/status';
import { formatNumber } from '$lib/units';

export interface Band {
	min: number | null;
	max: number | null;
}

/** About `count` round values across lo…hi, for the side axis; never fewer than two. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
	const span = hi - lo;
	if (!(span > 0) || count < 1) return [];
	const raw = span / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const steps = [0.5, 1, 2, 2.5, 5, 10].map((m) => m * mag);
	const within = (step: number) => {
		const out: number[] = [];
		for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6 || 0);
		return out;
	};
	// the round step nearest the ideal one, then a smaller one if that leaves just one number
	const i = steps.reduce((best, s, j) => (Math.abs(Math.log(s / raw)) < Math.abs(Math.log(steps[best] / raw)) ? j : best), 0);
	const out = within(steps[i]);
	return out.length >= 2 || i === 0 ? out : within(steps[i - 1]);
}

/** Which of the points (their x positions, left to right) is nearest to px. */
export function nearestIndex(xs: number[], px: number): number {
	let lo = 0;
	let hi = xs.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (xs[mid] < px) lo = mid;
		else hi = mid;
	}
	return Math.abs(xs[hi] - px) < Math.abs(xs[lo] - px) ? hi : lo;
}

/** "Nitrate (ppm)" up the side; just the unit when a short chart has no room for the rest. */
export function axisTitle(name: string, unit: string, room: number): string {
	const long = name ? (unit ? `${name} (${unit})` : name) : unit;
	return long.length * 6.5 <= room ? long : unit || name;
}

/** "≤ 0.25": 0 is best, anything up to the limit a trace (the ▲ Near status). */
export const zeroIsBest = (band: Band) => band.min === 0 && band.max != null && band.max > 0;
/** A band that starts above 0 has a ✕ Low zone under it. */
export const hasLowZone = (band: Band) => band.min != null && band.min > 0;

export interface ZoneLabel {
	y: number;
	title: string;
	sub: string;
	bad: boolean;
	/** the height of its zone, for how much detail fits */
	room: number;
}

/**
 * The zones named in the right-hand gutter (#74), where they fit (14px):
 * ✕ High over the band, ✓ Target in it (or ▲ Trace and ✓ 0 is best when 0
 * is best), ✕ Low under a band that starts above 0. `at` are the y positions.
 */
export function zoneLabels(
	band: Band,
	decimals: number,
	at: { top: number; bandTop: number; bandBottom: number; baseline: number; zero: number }
): ZoneLabel[] {
	const f = (v: number) => formatNumber(v, decimals);
	const mid = (a: number, b: number) => (a + b) / 2;
	const out: ZoneLabel[] = [];
	if (band.max != null) out.push({ y: mid(at.top, at.bandTop), title: '✕ High', sub: `over ${f(band.max)}`, bad: true, room: at.bandTop - at.top });
	if (zeroIsBest(band)) {
		out.push({ y: mid(at.bandTop, at.zero), title: '▲ Trace', sub: `0–${f(band.max!)}`, bad: false, room: at.zero - at.bandTop });
		out.push({ y: at.zero, title: '✓ 0 is best', sub: '', bad: false, room: 99 });
	} else {
		const range = band.min != null && band.max != null ? `${f(band.min)}–${f(band.max)}` : band.max != null ? `up to ${f(band.max)}` : `${f(band.min!)} or more`;
		out.push({ y: mid(at.bandTop, at.bandBottom), title: '✓ Target', sub: range, bad: false, room: at.bandBottom - at.bandTop });
		if (hasLowZone(band)) out.push({ y: mid(at.bandBottom, at.baseline), title: '✕ Low', sub: `under ${f(band.min!)}`, bad: true, room: at.baseline - at.bandBottom });
	}
	return out.filter((z) => z.room >= 14);
}

/** "✕ 15 over target", "▲ Near high", "✓ In range"; "" without a target. */
export function readoutStatus(v: number, band: Band, decimals: number): string {
	if (band.min == null && band.max == null) return '';
	const st = paramStatus(v, band);
	if (st.level !== 'bad') return st.level === 'ok' ? '✓ In range' : statusShort(st);
	const over = band.max != null && v > band.max;
	const diff = over ? v - band.max! : band.min! - v;
	return `✕ ${formatNumber(diff, decimals)} ${over ? 'over' : 'under'} target`;
}

/** "Today · 9:00 AM", "Oct 3, 2026": when a reading was taken, for the readout. */
export function readoutWhen(t: number, timeZone: string | undefined, withTime: boolean, now = Date.now()): string {
	const d = new Date(t);
	const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone });
	const day = dayOf(t) === dayOf(now) ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
	return withTime ? `${day} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })}` : day;
}

/** The reading a key moves to (the chart is a slider): null puts the readout away, undefined isn't a chart key. */
export function keyIndex(key: string, active: number | null, end: number): number | null | undefined {
	if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(end, (active ?? -1) + 1);
	if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, (active ?? end + 1) - 1);
	if (key === 'Home') return 0;
	if (key === 'End') return end;
	if (key === 'Escape') return null;
	return undefined;
}

/** Each marker's tap width: 44px, narrower where the next one is closer, so no tap area covers another's dot. */
export function tapWidths(xs: number[]): number[] {
	return xs.map((at, i) => Math.max(14, Math.min(44, ...xs.map((o, j) => (j === i ? 44 : Math.abs(o - at))))));
}

/** The tooltip's place: beside the reading at (px, py), flipped inside the chart's edges. */
export function tipStyle(px: number, py: number, width: number): string {
	const side = px < 200 ? '0' : px > width - 200 ? '-100%' : '-50%';
	const below = py < 110;
	return `left:${px}px;top:${py}px;transform:translate(${side},${below ? '14px' : 'calc(-100% - 14px)'})`;
}
