<script module lang="ts">
	import { chartDomain } from '$lib/charts';
	const W = 100;
	const H = 24;
	/** keeps the 2px stroke inside the box at the highest and lowest reading */
	const PAD = 2;
	const round = (n: number) => Math.round(n * 100) / 100;

	/** The range drawn: the series' own, or with a target band the chart's (#74), with room past the band. */
	function scale(values: number[], lo?: number | null, hi?: number | null) {
		if (lo == null && hi == null) return { min: Math.min(...values), max: Math.max(...values) };
		const d = chartDomain(values, { min: lo ?? null, max: hi ?? null });
		return { min: d.lo, max: d.hi };
	}
	const yOf = (v: number, min: number, max: number) => round(H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD));

	/**
	 * Polyline points for a series in the 100×24 box, scaled to the series' own
	 * min and max (higher readings sit higher), or with the target band (lo, hi)
	 * in the scale too. One reading, or all the same with no band, is a flat
	 * line across the middle.
	 */
	export function sparkPoints(values: number[], lo?: number | null, hi?: number | null): string {
		if (!values.length) return '';
		const { min, max } = scale(values, lo, hi);
		if (max === min) return `0,${H / 2} ${W},${H / 2}`;
		if (values.length === 1) return `0,${yOf(values[0], min, max)} ${W},${yOf(values[0], min, max)}`;
		const step = W / (values.length - 1);
		return values.map((v, i) => `${round(i * step)},${yOf(v, min, max)}`).join(' ');
	}

	/** The target band as a rect in the same box: from hi (or the top) down to lo (or the bottom). */
	export function sparkBand(values: number[], lo?: number | null, hi?: number | null) {
		if (!values.length || (lo == null && hi == null)) return null;
		const { min, max } = scale(values, lo, hi);
		if (max === min) return null;
		const top = yOf(hi ?? max, min, max);
		return { y: top, height: round(yOf(lo ?? min, min, max) - top) };
	}
</script>

<script lang="ts">
	// The last few readings as a line over the target band when lo / hi are given
	// (redesign README → Screens §2): ink, or the accent when the latest reading is out of range.
	import type { StatusLevel } from '$lib/status';
	let { values, level, lo = null, hi = null }: { values: number[]; level: StatusLevel; lo?: number | null; hi?: number | null } = $props();
	const points = $derived(sparkPoints(values, lo, hi));
	const band = $derived(sparkBand(values, lo, hi));
</script>

<svg class="spark {level}" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
	{#if band}<rect x="0" width={W} y={band.y} height={band.height} />{/if}
	{#if points}<polyline {points} />{/if}
</svg>

<style>
	.spark {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	/* the target band in neutral-300; the line in ink, red only when the latest reading is out of range */
	rect {
		fill: var(--band);
	}
	polyline {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.warn polyline {
		stroke: var(--warn);
	}
	.bad polyline {
		stroke: var(--accent);
	}
</style>
