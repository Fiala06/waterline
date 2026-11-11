<svelte:options namespace="svg" />

<script lang="ts">
	// A chart's bottom edge (TrendChart, OverlayChart; #264): the 2px ink
	// baseline, two to five dates under it (the last "Today" when it is), and
	// "Date" under those when `titled`. Drawn inside the chart's <svg>.
	import { dateTicks, readoutWhen, shortDate } from './trend-chart';

	let {
		from,
		to,
		x,
		left,
		right,
		width,
		baseline,
		height,
		timeZone,
		titled = false
	}: {
		from: number;
		to: number;
		x: (t: number) => number;
		left: number;
		right: number;
		width: number;
		baseline: number;
		/** the chart's height: the title sits on its bottom edge */
		height: number;
		timeZone?: string;
		titled?: boolean;
	} = $props();

	const ticks = $derived(dateTicks(from, to, width - left));
	const isToday = (t: number) => readoutWhen(t, timeZone, false) === 'Today';
</script>

<line x1={left} x2={width - right} y1={baseline} y2={baseline} class="baseline"></line>
{#each ticks as t, i (i)}
	<text
		x={i === 0 ? left : i === ticks.length - 1 ? width - right : x(t)}
		y={baseline + 16}
		class="axis"
		text-anchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
		>{i === ticks.length - 1 && isToday(t) ? 'Today' : shortDate(t, timeZone)}</text
	>
{/each}
{#if titled}
	<text class="axis-title" x={left + (width - left - right) / 2} y={height - 4} text-anchor="middle">Date</text>
{/if}

<style>
	.baseline {
		stroke: var(--ink);
		stroke-width: 2;
	}
	.axis {
		fill: var(--text-muted);
		font-size: 12px;
	}
	.axis-title {
		fill: var(--text-2);
		font-size: 12px;
		font-weight: 700;
	}
</style>
