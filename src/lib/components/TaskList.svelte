<script lang="ts">
	// Dashboard task rows with Mark done. Mark done on a water-change or test
	// task opens the matching log form instead.
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
		/** a routine's amount (#17): "1 pump" */
		amount?: number | null;
		amountUnit?: string | null;
	}
	let { tasks, today }: { tasks: TaskRow[]; today: string } = $props();

	const from = $derived(page.url.pathname + page.url.search);
</script>

	<div class="card list">
		{#each tasks as t, i (t.id)}
			{@const d = dueInfo(t.due, today)}
			<!-- refresh 1c: "✕ 1 day over", "▲ Today", how soon ("In 2 days"), or a date further off;
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
					<div class="due data-meta {d.days > 0 ? 'plain' : `status-${d.level}`}">{when}{#if dose}<span class="plain">{` · ${dose}`}</span>{/if}</div>
				</div>
				<form method="POST" action="/tasks?/done" use:enhance={markDone}>
					<input type="hidden" name="taskId" value={t.id} />
					<input type="hidden" name="from" value={from} />
					{#if d.days > 0}
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
		overflow: hidden;
	}
	.row {
		padding: 14px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
	}
	.due {
		font-size: 12px;
		font-weight: 600;
	}
	.due .plain {
		color: var(--text-muted);
		font-weight: 400;
	}
	.due.plain {
		color: var(--text-muted);
		font-weight: 400;
	}
	/* not due yet: there if it's needed, but not asking to be pressed */
	.early {
		background: transparent;
		border-color: transparent;
		color: var(--text-muted);
		font-weight: 500;
	}
	.early:hover {
		border-color: var(--border);
		color: var(--text);
	}
	@media (min-width: 1024px) {
		.row .name {
			font-size: 15px;
		}
		.row .btn {
			min-height: 38px;
			border-radius: 10px;
			padding: 0 14px;
			font-size: 14px;
		}
	}
</style>
