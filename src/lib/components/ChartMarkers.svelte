<script lang="ts">
	// The event markers along a chart's top (TrendChart, OverlayChart; #264): a
	// 44px tap target each, its own glyph per kind of event (#88), a button when
	// the chart picks one (with a popover for the chosen one), else a link.
	import type { Snippet } from 'svelte';
	import type { Marker } from './TrendChart.svelte';
	import { shortDate, tapWidths } from './trend-chart';

	let {
		markers,
		x,
		top,
		width,
		timeZone,
		selected = null,
		onselect,
		popover
	}: {
		markers: Marker[];
		x: (t: number) => number;
		/** the y of the plot's top edge: the markers sit just above it */
		top: number;
		/** the chart's width, to keep the popover inside it */
		width: number;
		timeZone?: string;
		selected?: string | null;
		onselect?: (m: Marker) => void;
		popover?: Snippet<[Marker]>;
	} = $props();

	const chosen = $derived(markers.find((m) => m.href === selected) ?? null);
	const tapWidth = $derived(tapWidths(markers.map((m) => x(m.t))));
</script>

{#each markers as m, i (m.href)}
	{#if onselect}
		<button
			type="button"
			class="marker {m.kind ?? ''}"
			class:chosen={m.href === selected}
			style:left="{x(m.t)}px"
			style:top="{top - 10}px"
			style:--tap="{tapWidth[i]}px"
			aria-label="{m.label}, {shortDate(m.t, timeZone)}"
			aria-pressed={m.href === selected}
			onclick={() => onselect(m)}
		></button>
	{:else}
		<a class="marker {m.kind ?? ''}" href={m.href} style:left="{x(m.t)}px" style:top="{top - 10}px" style:--tap="{tapWidth[i]}px" title={m.label} aria-label="{m.label}, {shortDate(m.t, timeZone)}"></a>
	{/if}
{/each}
{#if chosen && popover}
	<div class="pop" style:left="{Math.min(Math.max(x(chosen.t) - 90, 0), width - 200)}px" style:top="{top + 4}px">
		{@render popover(chosen)}
	</div>
{/if}

<style>
	/* a 44px target, with the 10px square drawn in its middle */
	.marker {
		position: absolute;
		z-index: 1;
		width: var(--tap, 44px);
		height: 44px;
		margin: -22px 0 0 calc(var(--tap, 44px) / -2);
		padding: 0;
		border: none;
		background: none;
	}
	.marker::before {
		content: '';
		position: absolute;
		top: 17px;
		left: calc(50% - 5px);
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		background: var(--ink);
	}
	/* each overlay its own glyph (#88): a dose is a diamond, CO₂ a bar, a light a triangle,
	   a trim a cross, other maintenance a hollow square, algae a hollow diamond;
	   all in the neutral, the water change in ink */
	.marker.dosing::before {
		transform: rotate(45deg) scale(0.8);
		background: var(--neutral-600);
	}
	.marker.co2::before {
		top: 20px;
		height: 4px;
		background: var(--neutral-600);
	}
	.marker.light::before {
		background: var(--neutral-600);
		clip-path: polygon(50% 0, 100% 100%, 0 100%);
	}
	.marker.trim::before {
		background:
			linear-gradient(45deg, transparent 38%, var(--neutral-600) 38% 62%, transparent 62%),
			linear-gradient(-45deg, transparent 38%, var(--neutral-600) 38% 62%, transparent 62%);
	}
	.marker.maintenance::before {
		background: none;
		border: 2px solid var(--neutral-600);
	}
	.marker.algae::before {
		background: none;
		border: 2px solid var(--neutral-600);
		transform: rotate(45deg) scale(0.8);
	}
	.marker:hover::before,
	.marker:focus-visible::before,
	.marker.chosen::before {
		background: var(--accent);
	}
	.marker:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -8px;
	}
	.pop {
		position: absolute;
		width: 200px;
		z-index: 2;
		background: var(--bg);
		border: 2px solid var(--ink);
		padding: 10px 12px;
		box-shadow: var(--shadow-md);
	}
</style>
