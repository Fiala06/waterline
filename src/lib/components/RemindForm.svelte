<script lang="ts">
	// "Remind me about this tank": what, and when (tomorrow, in 3 days, next
	// week, in 2 weeks, or a date). Saved as a one-off task, so it's in Tasks
	// and its reminder email comes like any other.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount, untrack } from 'svelte';
	import DateField from './DateField.svelte';
	import { REMIND_WHEN } from '$lib/tasks';
	import { addDays } from '$lib/time';

	let {
		tankId,
		tankName,
		today,
		from,
		error = null,
		values = null,
		onsaved
	}: {
		tankId: string;
		tankName: string;
		today: string;
		/** where saving goes back to */
		from: string;
		error?: string | null;
		values?: { name: string; when: string; date: string } | null;
		/** in a sheet: close it once saved */
		onsaved?: () => void;
	} = $props();

	let when = $state(untrack(() => values?.when || '7'));
	let date = $state(untrack(() => values?.date || addDays(today, 1)));
	let failed = $state<string | null>(null);
	let busy = $state(false);
	let ready = $state(false);
	onMount(() => (ready = true));
	const shown = $derived(failed ?? error);

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') {
				failed = (result.data?.error as string | undefined) ?? "Couldn't save it. Try again.";
				return;
			}
			failed = null;
			onsaved?.();
			await update();
		};
	};
</script>

<form method="POST" action="/tanks/{tankId}/remind" class="remind" use:enhance={submit}>
	<input type="hidden" name="from" value={from} />
	{#if shown}<p class="banner banner-bad" role="alert">✕ {shown}</p>{/if}
	<div class="field">
		<label class="label" for="remind-name">Remind me to</label>
		<input
			class="input"
			id="remind-name"
			name="name"
			required
			maxlength="80"
			autocomplete="off"
			placeholder="Check the new shrimp"
			value={values?.name ?? ''}
		/>
	</div>
	<fieldset class="field">
		<legend class="label">When</legend>
		<div class="chips">
			{#each REMIND_WHEN as w (w.value)}
				<label class="chip"><input type="radio" name="when" value={w.value} bind:group={when} />{w.label}</label>
			{/each}
		</div>
	</fieldset>
	<!-- without scripts the date is always there, for "On a date" -->
	{#if when === 'date' || !ready}
		<div class="field">
			<label class="label" for="remind-date">Date</label>
			<DateField name="date" id="remind-date" bind:value={date} min={addDays(today, 1)} {today} label="Remind me on" />
		</div>
	{/if}
	<p class="hint">A one-off task for {tankName}, in Tasks and your reminder emails.</p>
	<button class="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Set reminder'}</button>
</form>

<style>
	.remind {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.banner {
		margin: 0;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
</style>
