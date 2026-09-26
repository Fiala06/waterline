<script lang="ts">
	// G8 · Snooze. Moves only this occurrence; the schedule after it stays the same.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
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
	$effect(() => {
		if (open) {
			picking = false;
			custom = task ? addDays(task.due > today ? task.due : today, 1) : '';
		}
	});
	const options = $derived(task ? snoozeOptions(today, task.due) : []);
	const from = $derived(page.url.pathname + page.url.search);
	const longDate = (d: string) =>
		new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<Sheet bind:open title="Snooze" width={440}>
	{#if task}
		<p class="ctx muted">{task.name} · {tankName} · due {fmtDate(task.due)}</p>
		<div class="opts">
			{#each options as o (o.date)}
				<form method="POST" action="/tasks?/snooze" use:enhance={() => async ({ update }) => { open = false; await update(); }}>
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="until" value={o.date} />
					<input type="hidden" name="from" value={from} />
					<button class="opt"><span>{o.label}</span><span class="muted">{longDate(o.date)}</span></button>
				</form>
			{/each}
			{#if picking}
				<form method="POST" action="/tasks?/snooze" class="pick" use:enhance={() => async ({ update }) => { open = false; await update(); }}>
					<input type="hidden" name="taskId" value={task.id} />
					<input type="hidden" name="from" value={from} />
					<input class="input" type="date" name="until" min={addDays(today, 1)} bind:value={custom} required aria-label="Snooze until" />
					<button class="btn btn-primary">Snooze</button>
				</form>
			{:else}
				<button type="button" class="opt" onclick={() => (picking = true)}><span>Pick a date…</span><span class="muted">›</span></button>
			{/if}
		</div>
		<p class="note">Snoozing moves only this occurrence. The schedule after it stays the same.</p>
	{/if}
</Sheet>

<style>
	.ctx {
		margin: -8px 0 0;
		font-size: 14px;
	}
	.opts {
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.opts > * + * {
		border-top: 1px solid var(--border);
	}
	.opt {
		width: 100%;
		min-height: 56px;
		padding: 0 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 16px;
		font-weight: 600;
	}
	.opt:hover {
		background: var(--surface-hi);
	}
	.opt .muted {
		font-weight: 400;
		font-size: 14px;
	}
	.pick {
		display: flex;
		gap: 8px;
		padding: 10px;
	}
	.pick .input {
		flex: 1;
	}
	.note {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
</style>
