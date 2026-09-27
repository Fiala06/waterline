<script module lang="ts">
	const W = 100;
	const H = 24;
	/** keeps the 2px stroke inside the box at the highest and lowest reading */
	const PAD = 2;
	const round = (n: number) => Math.round(n * 100) / 100;

	/**
	 * Polyline points for a series in the 100×24 box, scaled to the series' own
	 * min and max (higher readings sit higher). One reading, or all the same,
	 * is a flat line across the middle.
	 */
	export function sparkPoints(values: number[]): string {
		if (!values.length) return '';
		const min = Math.min(...values);
		const max = Math.max(...values);
		if (max === min) return `0,${H / 2} ${W},${H / 2}`;
		const step = W / (values.length - 1);
		return values.map((v, i) => `${round(i * step)},${round(H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD))}`).join(' ');
	}
</script>

<script lang="ts">
	// The last few readings as a line, colored by the latest one's status (design 1a).
	import type { StatusLevel } from '$lib/status';
	let { values, level }: { values: number[]; level: StatusLevel } = $props();
	const points = $derived(sparkPoints(values));
</script>

<svg class="spark {level}" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
	{#if points}<polyline {points} />{/if}
</svg>

<style>
	.spark {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	polyline {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.warn polyline {
		stroke: var(--warn);
	}
	.bad polyline {
		stroke: var(--bad);
	}
</style>
