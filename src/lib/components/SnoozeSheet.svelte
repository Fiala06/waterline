<script lang="ts">
	// G8 · Snooze. Moves only this occurrence; the schedule after it stays the same.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import DateField from './DateField.svelte';
	import Sheet from './Sheet.svelte';
	import { snoozeOptions } from '$lib/tasks';
	import { addDays, fmtDate } from '$lib/time';

	let {
		open = $bindable(false),
		task,
		tankName,
		today
	}: {
		open?: boolean;
		task: { id: string; name: string; due: string } | null;
		tankName: string;
		today: string;
	} = $props();

	let picking = $state(false);
	let custom = $state('');
	// the server only takes dates after the due date (or after today when overdue)
	const minDate = $derived(task ? addDays(task.due > today ? task.due : today, 1) : '');
	$effect(() => {
		if (open) {
			picking = false;
			custom = minDate;
		}
	});
	const options = $derived(task ? snoozeOptions(today, task.due) : []);
	const from = $derived(page.url.pathname + page.url.search);
	const longDate = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<!-- The title and task line are stacked (G8), so the sheet's own header isn't used. -->
<Sheet bind:open label="Snooze" width={440}>
	{#if task}
		<div class="head">
			<div class="title-row">
				<h2>Snooze</h2>
				<button type="button" class="cancel" onclick={() => (open = false)}>Cancel</button>
			</div>
			<p class="ctx">{task.name} · {tankName} · due {fmtDate(task.due)}</p>
		</div>
		<div class="opts">
			{#each options as o (o.label)}
				<form method="POST" action="/tasks?/snooze" use:enhance={() => async ({ update }) => { open = false; await update(); }}>
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="until" value={o.date} />
					<input type="hidden" name="from" value={from} />
					<button class="opt"><span>{o.label}</span><span class="date">{longDate(o.date)}</span></button>
				</form>
			{/each}
			{#if picking}
				<form method="POST" action="/tasks?/snooze" class="pick" use:enhance={() => async ({ update }) => { open = false; await update(); }}>
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="from" value={from} />
					<div class="pick-date-field">
						<DateField name="until" bind:value={custom} min={minDate} required label="Snooze until" format="weekday" {today} />
					</div>
					<button class="btn btn-primary">Snooze</button>
				</form>
			{:else}
				<button type="button" class="opt pick-date" onclick={() => (picking = true)}><span>Pick a date…</span><span aria-hidden="true">›</span></button>
			{/if}
		</div>
		<p class="note">Snoozing moves only this occurrence. The schedule after it stays the same.</p>
	{/if}
</Sheet>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: -2px;
	}
	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}
	.ctx {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.cancel {
		flex-shrink: 0;
		/* 44px to tap, without pushing the task line down */
		min-height: 44px;
		margin-block: -7px;
		padding: 0 4px;
		font-size: 15px;
		color: var(--text-muted);
	}
	.cancel:hover {
		color: var(--text);
	}
	/* G8: one grouped list on the raised surface */
	.opts {
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		background: var(--surface-hi);
		border: 1px solid var(--border-strong);
		overflow: hidden;
		margin-top: -2px;
	}
	.opts > * + * {
		border-top: 1px solid var(--border-strong);
	}
	.opt {
		width: 100%;
		min-height: 54px;
		padding: 0 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		font-size: 16px;
		text-align: left;
	}
	.date {
		font-size: 14px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.pick-date {
		color: var(--accent);
		font-weight: 600;
	}
	@media (hover: hover) {
		.opt:hover {
			background: var(--selected);
		}
	}
	.opt:focus-visible {
		outline-offset: -2px;
	}
	.pick {
		display: flex;
		gap: 8px;
		padding: 10px;
	}
	.pick-date-field {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.pick-date-field :global(.input) {
		flex: 1;
		height: 48px;
	}
	.pick .btn {
		min-height: 48px;
	}
	.note {
		margin: -2px 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-faint);
	}
</style>
