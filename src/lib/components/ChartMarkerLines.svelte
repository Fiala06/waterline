<svelte:options namespace="svg" />

<script lang="ts">
	// The dashed line down the plot under each event marker (TrendChart,
	// OverlayChart; #264): dotted for the overlays, solid ink for the chosen one.
	// Drawn inside the chart's <svg>.
	import type { Marker } from './TrendChart.svelte';

	let { markers, x, top, baseline, selected = null }: { markers: Marker[]; x: (t: number) => number; top: number; baseline: number; selected?: string | null } = $props();
</script>

{#each markers as m (m.href)}
	<line x1={x(m.t)} x2={x(m.t)} y1={top - 10} y2={baseline} class="marker-line {m.kind ?? ''}" class:chosen={m.href === selected}></line>
{/each}

<style>
	.marker-line {
		stroke: var(--text-muted);
		stroke-opacity: 0.6;
		stroke-dasharray: 3 3;
	}
	.marker-line.dosing,
	.marker-line.co2,
	.marker-line.light,
	.marker-line.trim,
	.marker-line.maintenance,
	.marker-line.algae {
		stroke-dasharray: 1 3;
	}
	.marker-line.chosen {
		stroke: var(--ink);
		stroke-opacity: 1;
		stroke-dasharray: none;
		stroke-width: 1.5;
	}
</style>
