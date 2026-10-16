<script lang="ts">
	// Pause tasks (#172): the tank's tasks to hold back, and until when.
	import { enhance } from '$app/forms';
	import DateField from '$lib/components/DateField.svelte';
	import { fmtDate } from '$lib/time';
	import { untrack } from 'svelte';
	let { data, form } = $props();
	let until = $state(untrack(() => form?.values?.until ?? data.until));
	let busy = $state(false);
	const ticked = (id: string, checked: boolean) => (form?.values ? form.values.ids.includes(id) : checked);
</script>

<svelte:head><title>Pause tasks · {data.tank.name}</title></svelte:head>

<div class="page">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Cancel</a>
		<h1>Pause tasks</h1>
		<span aria-hidden="true"></span>
	</div>
	<form
		method="POST"
		class="body"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="from" value={data.from} />
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
		{#if data.tasks.length}
			<fieldset class="field">
				<legend class="label">Tasks in {data.tank.name}</legend>
				<div class="list">
					{#each data.tasks as t (t.id)}
						<label class="row check-row"><input type="checkbox" name="task" value={t.id} checked={ticked(t.id, t.checked)} /><span class="name">{t.name}</span><span class="due">Due {fmtDate(t.due)}</span></label>
					{/each}
				</div>
			</fieldset>
			<div class="field">
				<label class="label" for="pause-until">Until</label>
				<DateField name="until" id="pause-until" bind:value={until} required label="Until" format="weekday" min={data.today} today={data.today} />
			</div>
			<p class="hint">
				Paused tasks aren't due and send no reminders. On {until ? fmtDate(until) : 'that day'} they pick up again: one that fell due meanwhile moves on by the days it was paused, and a course ends that much later. History notes both.
			</p>
			<button class="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Pausing…' : 'Pause'}</button>
		{:else}
			<p class="hint">Nothing to pause: {data.tank.name} has no tasks due.</p>
		{/if}
	</form>
</div>

<style>
	.page {
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
	legend {
		padding: 0 0 6px;
	}
	.list {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
	}
	.name {
		flex: 1;
		font-weight: 600;
	}
	.due {
		font-size: 13px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 560px;
		}
	}
</style>
