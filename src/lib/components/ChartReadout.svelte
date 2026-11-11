<script lang="ts">
	// The box a chart reads a test out in (TrendChart, OverlayChart; #264):
	// "Latest test" or "Water test" over what the chart puts in it, and a link to
	// open the test. `wide` for the all-parameters chart's list of readings.
	import type { Snippet } from 'svelte';

	let {
		latest,
		href,
		style,
		wide = false,
		tipWidth = $bindable(0),
		children
	}: {
		latest: boolean;
		href?: string;
		style: string;
		wide?: boolean;
		/** its width, for placing it beside the crosshair */
		tipWidth?: number;
		children: Snippet;
	} = $props();
</script>

<div class="readout" class:wide {style} bind:offsetWidth={tipWidth}>
	<span class="r-kicker">{latest ? 'Latest test' : 'Water test'}</span>
	{@render children()}
	{#if href}<a class="r-link" {href}>Open this test ›</a>{/if}
</div>

<style>
	.readout {
		position: absolute;
		z-index: 3;
		width: max-content;
		min-width: 190px;
		max-width: 240px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-md);
		pointer-events: none;
	}
	.readout.wide {
		min-width: 200px;
		max-width: 280px;
	}
	.r-kicker {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.r-link {
		padding-top: 4px;
		font-size: 12px;
		font-weight: 700;
		color: var(--bad);
		white-space: nowrap;
		pointer-events: auto;
	}
	.wide .r-link {
		padding-top: 6px;
	}
</style>
