<script lang="ts">
	// Dashboard refresh (1c): what needs attention, in one card. Out-of-range
	// readings, then near-limit ones, each with its recent readings over the
	// target band; then the water change when it's due or over. Status is the
	// glyph and word, the text color and the line, never a tinted card.
	import type { StatusLevel } from '$lib/status';
	import Sparkline from './Sparkline.svelte';

	interface Item {
		id: string;
		fullName: string;
		value: string | null;
		unit: string;
		level: StatusLevel;
		statusText: string;
		range: string;
		spark: number[];
		lo: number | null;
		hi: number | null;
	}
	let {
		items,
		wc,
		when
	}: {
		items: Item[];
		/** the water change, when it's due or over */
		wc: { days: number; goal: number; last: string | null } | null;
		/** "Today, 8:12 AM": when the latest test was */
		when: string | null;
	} = $props();

	const over = $derived(wc ? Math.max(0, wc.days - wc.goal) : 0);
	// the goal's share of the bar in the accent; what's past it in amber
	const fill = $derived(wc ? Math.min(wc.days, wc.goal) / Math.max(wc.days, wc.goal, 1) : 0);
</script>

<section class="attention" aria-labelledby="attention-h">
	<div class="head">
		<h2 id="attention-h">Needs attention</h2>
		{#if when}<span class="data-meta when">{when}</span>{/if}
	</div>
	<div class="card rows">
		{#each items as c (c.id)}
			<a class="row param" href="/charts?p={c.id}">
				<span class="text">
					<span class="title"><span class="name">{c.fullName}</span> <span class="status status-{c.level}">{c.statusText}</span></span>
					<span class="sub">{c.range ? `Target ${c.range}` : 'No target'}</span>
				</span>
				<span class="spark"><Sparkline values={c.spark} level={c.level} lo={c.lo} hi={c.hi} /></span>
				<span class="val"><span class="data v">{c.value}</span>{#if c.unit}<span class="unit">{c.unit}</span>{/if}</span>
			</a>
		{/each}
		{#if wc}
			<div class="row wc">
				<span class="text">
					<span class="title"
						><span class="name">Water change</span>
						<span class="status status-warn">{over ? `▲ ${over} day${over === 1 ? '' : 's'} over` : '▲ Due today'}</span></span
					>
					<span class="sub hide-phone">Every {wc.goal} day{wc.goal === 1 ? '' : 's'}{wc.last ? ` · last ${wc.last}` : ''}</span>
				</span>
				<span class="bar" role="img" aria-label="{wc.days} days since the last water change, goal {wc.goal}"
					><i class="done" style:width="{fill * 100}%"></i>{#if over}<i class="late" style:width="{(1 - fill) * 100}%"></i>{/if}</span
				>
				<span class="val"><span class="data v sm">{wc.days} / {wc.goal} d</span></span>
			</div>
		{/if}
	</div>
</section>

<style>
	.attention {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.when {
		color: var(--text-muted);
	}
	.rows {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 84px;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		color: var(--text);
	}
	.row + .row {
		border-top: 1px solid var(--divider-soft);
	}
	a.row:hover {
		background: var(--surface-hi);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.status {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	.spark {
		height: 24px;
	}
	.val {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 4px;
		min-width: 0;
	}
	.v {
		font-size: 22px;
		line-height: 1;
	}
	.v.sm {
		font-size: 15px;
		color: var(--text-2);
	}
	.unit {
		font-size: 11px;
		color: var(--text-muted);
	}
	/* the water change's cadence: 6px, the goal in the accent, what's over in amber */
	.bar {
		display: flex;
		height: 6px;
		border-radius: 3px;
		background: var(--track);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
	}
	.done {
		background: var(--accent);
	}
	.late {
		background: var(--warn-fill);
	}
	/* phones: the bar runs the full width under the title */
	@media (max-width: 1023px) {
		.wc {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'text val' 'bar bar';
			row-gap: 10px;
		}
		.wc .text {
			grid-area: text;
		}
		.wc .val {
			grid-area: val;
		}
		.wc .bar {
			grid-area: bar;
		}
	}
	@media (min-width: 1024px) {
		.row {
			grid-template-columns: minmax(0, 1fr) 160px 110px;
			gap: 20px;
			padding: 14px 20px;
		}
		.v {
			font-size: 24px;
		}
	}
</style>
