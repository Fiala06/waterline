<script lang="ts">
	// Task rows with Mark done (and Snooze on the Tasks screen). Mark done on a
	// water-change or test task opens the matching log form instead.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { dueInfo, intervalText } from '$lib/tasks';

	interface TaskRow {
		id: string;
		name: string;
		nextDue: string | null;
		recurring: boolean;
		intervalDays: number | null;
		tankId?: string;
	}
	let {
		tasks,
		today,
		compact = false,
		tankNames
	}: {
		tasks: TaskRow[];
		today: string;
		compact?: boolean;
		tankNames?: Record<string, string>;
	} = $props();

	const from = $derived(page.url.pathname + page.url.search);
</script>

{#if compact}
	<div class="card list">
		{#each tasks as t (t.id)}
			{@const d = dueInfo(t.nextDue!, today)}
			{@const urgent = d.days <= 0}
			<div class="row">
				<div class="text">
					<div class="name">{t.name}</div>
					<div class="due status-{d.level}" class:plain={d.level === 'ok'}>
						{d.level === 'warn' ? d.text : `${d.text} · ${intervalText(t)}`}
					</div>
				</div>
				<form method="POST" action="/tasks?/done" use:enhance>
					<input type="hidden" name="taskId" value={t.id} />
					<input type="hidden" name="from" value={from} />
					<button class="btn" class:btn-primary={urgent}>Mark done</button>
				</form>
			</div>
		{/each}
	</div>
{:else}
	<div class="cards">
		{#each tasks as t (t.id)}
			{@const d = dueInfo(t.nextDue!, today)}
			{@const urgent = d.days <= 0}
			<div class="card tcard" class:overdue={d.level === 'bad'}>
				<div class="text">
					<div class="name">{t.name}</div>
					<div class="meta">
						{#if tankNames}{tankNames[t.tankId ?? '']} · {/if}{intervalText(t)}
					</div>
					<div class="due status-{d.level}" class:plain={d.level === 'ok'}>{d.text}</div>
				</div>
				<div class="actions">
					<form method="POST" action="/tasks?/done" use:enhance class="grow">
						<input type="hidden" name="taskId" value={t.id} />
						<input type="hidden" name="from" value={from} />
						<button class="btn wide" class:btn-primary={urgent}>Mark done</button>
					</form>
					<form method="POST" action="/tasks?/snooze" use:enhance>
						<input type="hidden" name="taskId" value={t.id} />
						<input type="hidden" name="from" value={from} />
						<button class="btn snooze">Snooze 1 day</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
{/if}

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
		font-size: 13px;
		font-weight: 600;
	}
	.due.plain {
		color: var(--text-muted);
		font-weight: 400;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.tcard {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tcard.overdue {
		border-color: var(--bad-border);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.grow {
		flex: 1;
	}
	.wide {
		width: 100%;
	}
	.snooze {
		font-weight: 400;
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
