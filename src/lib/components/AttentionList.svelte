<script lang="ts">
	import type { Guidance } from '$lib/tips';
	// Overview › Needs attention (redesign README → Screens §2): rows of
	// `minmax(0,1fr) 150px 120px` under a 2px ink rule. Out-of-range readings,
	// then near-limit ones, each with its recent readings over the target band
	// and the big value; then the water change when it's due or over, and any
	// overdue task, each with Done. Status is the glyph and word, never a tint.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { markDone } from '$lib/splash';
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
		/** a sensor's latest reading (#19): "Live 25.4 °C · 2 min ago" */
		live?: string | null;
		/** what to do about it, in a line (#62), with the calculator that does the sums (#90) */
		next?: Guidance | null;
	}
	interface Overdue {
		id: string;
		name: string;
		/** "✕ 1 day over" */
		when: string;
		/** "Every 7 days", or a routine's line */
		sub: string;
	}
	let {
		items,
		wc,
		overdue = [],
		when
	}: {
		items: Item[];
		/** the water change, when it's due or over */
		wc: { taskId: string | null; days: number; goal: number; last: string | null } | null;
		/** tasks past their date, with Done */
		overdue?: Overdue[];
		/** "Today, 8:12 AM": when the latest test was */
		when: string | null;
	} = $props();

	const over = $derived(wc ? Math.max(0, wc.days - wc.goal) : 0);
	// the goal's share of the bar in ink; what's past it in the accent
	const fill = $derived(wc ? Math.min(wc.days, wc.goal) / Math.max(wc.days, wc.goal, 1) : 0);
	const count = $derived(items.length + (wc ? 1 : 0) + overdue.length);
	const from = $derived(page.url.pathname + page.url.search);
</script>

<section class="attention" aria-labelledby="attention-h">
	<div class="section-head">
		<h2 id="attention-h">Needs attention</h2>
		<span class="meta">{count} item{count === 1 ? '' : 's'}{when ? ` · ${when}` : ''}</span>
	</div>
	<div class="rows">
		{#each items as c (c.id)}
			<!-- the reading's row opens its chart; what to do sits under it, with the calculator that does the sums -->
			<div class="item">
				<a class="row param" href="/charts?p={c.id}">
					<span class="text">
						<span class="title"><span class="name">{c.fullName}</span> <span class="status status-{c.level}">{c.statusText}</span></span>
						<span class="sub">{c.range ? `Target ${c.range}` : 'No target'}{#if c.live}{' · '}<span class="live">● {c.live}</span>{/if}</span>
					</span>
					<span class="spark"><Sparkline values={c.spark} level={c.level} lo={c.lo} hi={c.hi} /></span>
					<span class="val"><span class="v">{c.value}</span>{#if c.unit}<span class="unit">{c.unit}</span>{/if}</span>
				</a>
				{#if c.next}
					<p class="next">
						{c.next.text}
						{#if c.next.link}<a class="act" href={c.next.link.href}>{c.next.link.label}<span class="sr-only"> for {c.fullName}</span></a>{/if}
					</p>
				{/if}
			</div>
		{/each}
		{#if wc}
			<div class="row wc">
				<span class="text">
					<span class="title"
						><span class="name">Water change</span>
						<span class="status status-warn">{over ? `▲ ${over} day${over === 1 ? '' : 's'} over` : '▲ Due today'}</span></span
					>
					<span class="sub">Every {wc.goal} day{wc.goal === 1 ? '' : 's'}{wc.last ? ` · last ${wc.last}` : ''}</span>
				</span>
				<span class="bar hide-phone" role="img" aria-label="{wc.days} days since the last water change, goal {wc.goal}"
					><i class="done" style:width="{fill * 100}%"></i>{#if over}<i class="late" style:width="{(1 - fill) * 100}%"></i>{/if}</span
				>
				<span class="val end">
					<span class="v sm hide-phone">{wc.days} / {wc.goal} d</span>
					{#if wc.taskId}
						<form method="POST" action="/tasks?/done" use:enhance={markDone}>
							<input type="hidden" name="taskId" value={wc.taskId} />
							<input type="hidden" name="from" value={from} />
							<button class="btn btn-primary" aria-label="Mark water change done">Done</button>
						</form>
					{/if}
				</span>
			</div>
		{/if}
		{#each overdue as t (t.id)}
			<div class="row task">
				<span class="text">
					<span class="title"><span class="name">{t.name}</span> <span class="status status-bad">{t.when}</span></span>
					<span class="sub">{t.sub}</span>
				</span>
				<span class="val end">
					<form method="POST" action="/tasks?/done" use:enhance={markDone}>
						<input type="hidden" name="taskId" value={t.id} />
						<input type="hidden" name="from" value={from} />
						<button class="btn btn-primary" aria-label="Mark {t.name} done">Done</button>
					</form>
				</span>
			</div>
		{/each}
	</div>
</section>

<style>
	.attention {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.rows > * + * {
		border-top: none;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 84px;
		align-items: center;
		gap: 6px 12px;
		min-height: 60px;
		padding: 12px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	/* the water change and a task: the text, then the button (the bar only on desktop) */
	.wc,
	.task {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	@media (hover: hover) {
		a.row:hover {
			background: var(--surface);
			box-shadow: -8px 0 0 var(--surface);
			color: var(--text);
		}
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 16px;
		font-weight: 700;
	}
	.status {
		font-size: 12px;
		font-weight: 800;
		white-space: nowrap;
		margin-left: 2px;
	}
	.sub {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* the reading's row and what to do about it share one divider */
	.item {
		border-bottom: 1px solid var(--divider);
	}
	.item .row {
		border-bottom: none;
	}
	/* what to do: under the whole row, so it reads in one or two lines on a phone */
	.next {
		margin: -6px 0 0;
		padding-bottom: 12px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--text);
	}
	.next .act {
		display: inline-block;
		min-height: 44px;
		line-height: 44px;
		margin: -14px 0 -16px;
		font-weight: 800;
		color: var(--accent-text);
		white-space: nowrap;
	}
	.spark {
		height: 22px;
	}
	.val {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 2px;
		min-width: 0;
	}
	.val.end {
		align-items: center;
		gap: 16px;
	}
	.v {
		font-size: 22px;
		font-weight: 800;
		line-height: 1;
	}
	.v.sm {
		font-size: 16px;
	}
	.unit {
		font-size: 11px;
		color: var(--text-muted);
	}
	/* the water change's cadence: 8px, the goal in ink, what's over in the accent */
	.bar {
		display: flex;
		height: 8px;
		background: var(--band);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
	}
	.done {
		background: var(--ink);
	}
	.late {
		background: var(--accent);
	}
	@media (min-width: 1024px) {
		.row {
			grid-template-columns: minmax(0, 1fr) 120px 96px;
			gap: 16px;
			padding: 14px 0;
		}
		.wc {
			grid-template-columns: minmax(0, 1fr) 120px auto;
		}
		.task {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.spark {
			height: 28px;
		}
		.v {
			font-size: 28px;
		}
		.status {
			font-size: 13px;
			margin-left: 6px;
		}
		.name {
			font-weight: 600;
		}
	}
	@media (min-width: 1200px) {
		.row {
			grid-template-columns: minmax(0, 1fr) 150px 120px;
			gap: 24px;
		}
		.wc {
			grid-template-columns: minmax(0, 1fr) 150px auto;
		}
	}
</style>
