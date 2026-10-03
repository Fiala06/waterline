<script lang="ts">
	// Log health: the animals, the symptoms as chips, a treatment, and how it stands
	// (▲ Watching, ▲ Treating, ✓ Recovered, ✕ Lost). Works without scripts.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/DateField.svelte';

	let { data, form } = $props();
	const v = $derived(form?.values);
	const errors = $derived(form?.errors ?? {});
	let chosen = $state(untrack(() => form?.values?.livestockIds ?? (data.preselect ? [data.preselect] : data.livestock.length === 1 ? [data.livestock[0].id] : [])));
	let outcome = $state(untrack(() => form?.values?.outcome ?? 'watching'));
	let date = $state(untrack(() => form?.values?.date || data.now.date));
	let busy = $state(false);
	// a loss of one animal can take 1 off its count
	const lostOne = $derived(outcome === 'lost' && chosen.length === 1);
	const lostName = $derived(data.livestock.find((l) => l.id === chosen[0])?.label ?? '');
</script>

<svelte:head><title>Log health · {data.tank.name}</title></svelte:head>

<form
	method="POST"
	action="?/save"
	class="hform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<input type="hidden" name="from" value={data.from} />
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={data.from}>Cancel</a>
		<h1>Log health</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		{#if errors.when}<p class="banner banner-bad" role="alert">✕ {errors.when}</p>{/if}

		{#if data.livestock.length}
			<fieldset class="field">
				<legend class="label">Which animals</legend>
				<div class="rows who" class:invalid={!!errors.livestock}>
					{#each data.livestock as l (l.id)}
						<label class="check-row">
							<input type="checkbox" name="livestock" value={l.id} bind:group={chosen} />
							<span class="who-name">{l.label}</span>
							{#if l.count > 1}<span class="who-count">×{l.count}</span>{/if}
						</label>
					{/each}
				</div>
				{#if errors.livestock}<span class="error-text">✕ {errors.livestock}</span>{/if}
			</fieldset>
		{:else}
			<p class="banner banner-warn">No livestock in this tank yet. <a href="/tanks/{data.tank.id}/livestock/new">Add livestock</a> first.</p>
		{/if}

		<fieldset class="field">
			<legend class="label">Symptoms</legend>
			<div class="chips">
				{#each data.symptoms as s (s)}
					<label class="chip"><input type="checkbox" name="symptom" value={s} defaultChecked={v?.symptoms.includes(s) ?? false} />{s}</label>
				{/each}
			</div>
			{#if errors.symptoms}<span class="error-text">✕ {errors.symptoms}</span>{/if}
		</fieldset>

		<div class="field">
			<label class="label" for="h-treatment">Treatment · optional</label>
			<input class="input" id="h-treatment" name="treatment" maxlength="120" autocomplete="off" defaultValue={v?.treatment ?? ''} placeholder="e.g. Metro, salt, raised temperature" />
		</div>

		<fieldset class="field">
			<legend class="label">How it stands</legend>
			<div class="segmented outcome">
				{#each data.outcomes as o (o.value)}
					<label><input type="radio" name="outcome" value={o.value} bind:group={outcome} />{o.glyph} {o.label}</label>
				{/each}
			</div>
			{#if errors.outcome}<span class="error-text">✕ {errors.outcome}</span>{/if}
			{#if lostOne}
				<label class="check-row reduce">
					<input type="checkbox" name="reduce" value="1" defaultChecked={v ? v.reduce : true} />
					<span>Also reduce the count by 1{lostName ? ` · ${lostName}` : ''}</span>
				</label>
			{/if}
		</fieldset>

		<div class="when">
			<div class="field">
				<label class="label" for="h-date">Date</label>
				<DateField name="date" id="h-date" bind:value={date} required label="Date" max={data.today} today={data.today} />
			</div>
			<div class="field">
				<label class="label" for="h-time">Time</label>
				<input class="input" id="h-time" type="time" name="time" required defaultValue={v?.time || data.now.time} />
			</div>
		</div>

		<div class="field">
			<label class="label" for="h-note">Note · optional</label>
			<textarea class="input" id="h-note" name="note" rows="3" maxlength="4000" defaultValue={v?.note ?? ''} placeholder="What you saw, what changed"></textarea>
		</div>
	</div>

	<div class="foot">
		<button class="btn btn-primary save" disabled={busy || !data.livestock.length}>Save</button>
		<!-- the same entry, then a dosing routine with an end, filled in with the treatment -->
		<button class="btn course" name="then" value="course" disabled={busy || !data.livestock.length}>Save and start a treatment course</button>
		<a class="btn cancel-btn hide-phone" href={data.from}>Cancel</a>
	</div>
</form>

<style>
	.hform {
		display: flex;
		flex-direction: column;
		max-width: 560px;
	}
	/* Cancel · Log health · Save */
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 4px 20px 8px;
	}
	.cancel {
		justify-self: start;
		font-size: 16px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 16px;
		min-height: 44px;
	}
	.save-top:disabled {
		opacity: 0.45;
	}
	.body {
		padding: 8px 20px 12px;
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	/* the animals: a heading rule, then rows with 1px dividers */
	.who {
		border-top: 2px solid var(--ink);
	}
	.who .check-row {
		border-bottom: 1px solid var(--divider);
		gap: 12px;
	}
	.who.invalid {
		border-top-color: var(--bad);
	}
	.who-name {
		flex: 1;
		min-width: 0;
	}
	.who-count {
		font-size: 13px;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	/* four outcomes: two by two on a phone */
	.outcome {
		display: grid;
		grid-auto-flow: row;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.outcome label {
		white-space: nowrap;
	}
	.reduce {
		margin-top: 8px;
	}
	.when {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
	}
	.banner a {
		text-decoration: underline;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.save {
		height: 56px;
		font-size: 17px;
	}
	.course {
		height: auto;
		min-height: 44px;
		padding: 10px 16px;
		white-space: normal;
	}
	@media (min-width: 640px) {
		.outcome {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	/* Desktop: a flat form under the shell's title, 2px rule above the footer */
	@media (min-width: 1024px) {
		.hform {
			max-width: 640px;
			padding: 24px 32px 40px;
		}
		.body {
			padding: 0;
		}
		.foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}
		.save {
			height: 44px;
			padding: 0 22px;
			font-size: 14px;
		}
		.cancel-btn {
			border: none;
			color: var(--text-muted);
		}
	}
</style>
