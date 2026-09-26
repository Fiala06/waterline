<script lang="ts">
	// 15 / D5 · Create or edit a task.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { scheduleExamples } from '$lib/tasks';
	import { parseNumber } from '$lib/units';

	interface Values {
		name: string;
		tankId: string;
		recurring: boolean;
		every: string;
		unit: 'days' | 'weeks';
		nextDue: string;
		scheduleMode: 'completion' | 'fixed';
		onDone: 'none' | 'test' | 'water_change';
	}
	let {
		mode,
		tanks,
		values,
		errors = {},
		action = '',
		cancelHref,
		compact = false
	}: {
		mode: 'new' | 'edit';
		tanks: { id: string; name: string }[];
		values: Values;
		errors?: Record<string, string>;
		action?: string;
		cancelHref: string;
		compact?: boolean;
	} = $props();

	let recurring = $state(untrack(() => values.recurring));
	let every = $state(untrack(() => values.every));
	let unit = $state(untrack(() => values.unit));
	let nextDue = $state(untrack(() => values.nextDue));
	let scheduleMode = $state(untrack(() => values.scheduleMode));
	let tankId = $state(untrack(() => values.tankId));
	let onDone = $state(untrack(() => values.onDone));
	let busy = $state(false);

	const days = $derived((parseNumber(every) ?? 0) * (unit === 'weeks' ? 7 : 1));
	const examples = $derived(days > 0 && nextDue ? scheduleExamples(nextDue, days) : null);
</script>

<form
	method="POST"
	action="{action}?/save"
	class="tform"
	class:compact
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="bar">
		<a class="cancel" href={cancelHref}>{compact ? '✕' : 'Cancel'}</a>
		<h1>{mode === 'edit' ? 'Edit task' : 'New task'}</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		<div class="field">
			<label class="label" for="t-name">Task</label>
			<input class="input" id="t-name" name="name" defaultValue={values.name} required maxlength="80" placeholder="e.g. Clean canister filter" aria-invalid={!!errors.name} />
			{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
		</div>

		<div class="field">
			<label class="label" for="t-tank">Tank</label>
			<select class="input" id="t-tank" name="tankId" bind:value={tankId}>
				{#each tanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</div>

		<fieldset class="field">
			<legend class="sr-only">Repeat</legend>
			<div class="segmented">
				<label><input type="radio" name="recurring" value="yes" defaultChecked={recurring} onchange={() => (recurring = true)} />Recurring</label>
				<label><input type="radio" name="recurring" value="no" defaultChecked={!recurring} onchange={() => (recurring = false)} />One-off</label>
			</div>
		</fieldset>

		{#if recurring}
			<fieldset class="field">
				<legend class="label">Repeat every</legend>
				<div class="every">
					<input class="input num-in" name="every" inputmode="numeric" bind:value={every} aria-label="Number" aria-invalid={!!errors.every} />
					<div class="segmented">
						<label><input type="radio" name="unit" value="days" bind:group={unit} />days</label>
						<label><input type="radio" name="unit" value="weeks" bind:group={unit} />weeks</label>
					</div>
				</div>
				{#if errors.every}<span class="error-text">✕ {errors.every}</span>{/if}
			</fieldset>
		{/if}

		<div class="field">
			<label class="label" for="t-due">Next due</label>
			<input class="input" id="t-due" name="nextDue" type="date" bind:value={nextDue} required aria-invalid={!!errors.nextDue} />
			{#if errors.nextDue}<span class="error-text">✕ {errors.nextDue}</span>{/if}
		</div>

		{#if recurring}
			<fieldset class="field">
				<legend class="label">Schedule counts from</legend>
				<label class="choice" class:on={scheduleMode === 'completion'}>
					<input type="radio" name="scheduleMode" value="completion" bind:group={scheduleMode} />
					<span><strong>When I complete it</strong><small>{examples?.completion ?? 'Next due counts from the day it’s done'}</small></span>
				</label>
				<label class="choice" class:on={scheduleMode === 'fixed'}>
					<input type="radio" name="scheduleMode" value="fixed" bind:group={scheduleMode} />
					<span><strong>Fixed calendar</strong><small>{examples?.fixed ?? 'Stays on the same schedule'}</small></span>
				</label>
			</fieldset>
		{/if}

		<div class="field">
			<label class="label" for="t-done">When marked done</label>
			<select class="input" id="t-done" name="onDone" bind:value={onDone}>
				<option value="none">Just mark it done</option>
				<option value="water_change">Open the water change form</option>
				<option value="test">Open the water test form</option>
			</select>
		</div>
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="btn btn-danger" popovertarget="confirm-task-delete">Delete task</button>
		{/if}
		<button class="btn btn-primary save" disabled={busy}>Save</button>
	</div>
</form>

{#if mode === 'edit'}
	<div id="confirm-task-delete" popover class="confirm" role="alertdialog" aria-labelledby="ctd-t">
		<h2 id="ctd-t">Delete “{values.name}”?</h2>
		<p>The reminder is removed. Entries you logged stay in the history.</p>
		<div class="c-actions">
			<button type="button" class="btn" popovertarget="confirm-task-delete" popovertargetaction="hide">Cancel</button>
			<form method="POST" action="{action}?/delete"><button class="btn btn-danger">Delete</button></form>
		</div>
	</div>
{/if}

<style>
	.tform {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 560px;
	}
	.tform.compact {
		min-height: 0;
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
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.save-top {
		justify-self: end;
		color: var(--accent);
		font-weight: 600;
		font-size: 16px;
		min-height: 44px;
	}
	.body {
		padding: 12px 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		flex: 1;
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
	.every {
		display: flex;
		gap: 8px;
	}
	.num-in {
		width: 96px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.every .segmented {
		flex: 1;
	}
	.choice {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--surface);
		cursor: pointer;
	}
	.choice + .choice {
		margin-top: 8px;
	}
	.choice.on {
		border-color: var(--accent);
	}
	.choice input {
		margin-top: 3px;
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
	}
	.choice span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.choice small {
		font-size: 13px;
		color: var(--text-muted);
	}
	.foot {
		padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 10px;
	}
	.save {
		flex: 1;
	}
	.confirm {
		border: 1px solid var(--border-strong);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		padding: 22px;
		width: min(400px, calc(100vw - 40px));
		box-shadow: var(--shadow-modal);
	}
	.confirm::backdrop {
		background: var(--scrim);
	}
	.confirm h2 {
		margin: 0 0 8px;
		font-size: 19px;
	}
	.confirm p {
		margin: 0 0 18px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.c-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.compact .bar {
		grid-template-columns: 1fr auto;
		padding: 18px 20px 4px;
	}
	.compact h1 {
		order: -1;
		font-size: 19px;
	}
	.compact .cancel {
		justify-self: end;
	}
	.compact .save-top {
		display: none;
	}
</style>
