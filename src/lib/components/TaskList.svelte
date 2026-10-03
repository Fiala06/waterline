<script lang="ts">
	// Overview › Due rows with Mark done (redesign README → Screens §2): the
	// name, then the when as an 11px uppercase line (✕ / ▲), under a 2px ink
	// rule with 1px dividers. Mark done on a water-change or test task opens the
	// matching log form instead, and the setup review (#30) is a Review that
	// opens its page.
	import { enhance } from '$app/forms';
	import { markDone } from '$lib/splash';
	import { page } from '$app/state';
	import { amountText, dueInfo, intervalText } from '$lib/tasks';
	import { fmtDate } from '$lib/time';

	interface TaskRow {
		id: string;
		name: string;
		due: string;
		recurring: boolean;
		intervalDays: number | null;
		scheduleMode?: string;
		weekdays?: string | null;
		tankId?: string;
		kind?: string;
		/** a routine's amount (#17): "1 pump" */
		amount?: number | null;
		amountUnit?: string | null;
	}
	let { tasks, today }: { tasks: TaskRow[]; today: string } = $props();

	const from = $derived(page.url.pathname + page.url.search);
</script>

<div class="list">
	{#each tasks as t, i (t.id)}
		{@const d = dueInfo(t.due, today)}
		<!-- "✕ 1 day over", "▲ Today", how soon ("In 2 days"), or a date further off;
		     the primary button only on the most urgent, and "Done early" for one that isn't due -->
		{@const when =
			d.days < 0
				? `✕ ${-d.days} day${d.days === -1 ? '' : 's'} over`
				: d.days === 0
					? '▲ Today'
					: `${d.days === 1 ? 'Tomorrow' : d.days <= 7 ? `In ${d.days} days` : fmtDate(t.due)} · ${intervalText(t)}`}
		{@const dose = amountText(t.amount, t.amountUnit)}
		<div class="row">
			<div class="text">
				<div class="name">{t.name}</div>
				<div class="due {d.days > 0 ? 'plain' : `status-${d.level}`}">{when}{#if dose}<span class="plain">{` · ${dose}`}</span>{/if}</div>
			</div>
			<form method="POST" action="/tasks?/done" use:enhance={markDone}>
				<input type="hidden" name="taskId" value={t.id} />
				<input type="hidden" name="from" value={from} />
				{#if t.kind === 'review'}
					<button class="btn" class:early={d.days > 0} class:btn-primary={d.days <= 0 && i === 0}>Review</button>
				{:else if d.days > 0}
					<button class="btn early" title="Due {fmtDate(t.due)}" aria-label="Mark {t.name} done early">Done early</button>
				{:else}
					<button class="btn" class:btn-primary={i === 0}>Mark done</button>
				{/if}
			</form>
		</div>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
	}
	.row {
		min-height: 60px;
		padding: 10px 0;
		display: flex;
		align-items: center;
		gap: 12px;
		border-bottom: 1px solid var(--divider);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
	}
	.due {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.due .plain,
	.due.plain {
		color: var(--text-muted);
		font-weight: 800;
	}
	.due .plain {
		font-weight: 400;
	}
	/* not due yet: the design's ghost, there if it's needed but not asking to be pressed */
	.early {
		border-color: transparent;
		color: var(--accent);
	}
	@media (hover: hover) {
		.early:hover {
			border-color: var(--divider);
		}
	}
	@media (min-width: 1024px) {
		.row {
			padding: 12px 0;
			min-height: 0;
		}
		.row .btn {
			padding: 0 14px;
		}
	}
</style>
