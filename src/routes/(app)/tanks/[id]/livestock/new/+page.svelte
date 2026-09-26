<script lang="ts">
	import { enhance } from '$app/forms';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	let { data, form } = $props();
	let kind = $state<'fish' | 'invert' | 'coral'>('fish');
	let count = $state(1);
</script>

<svelte:head><title>Add livestock · {data.tank.name}</title></svelte:head>

<form method="POST" class="lform" use:enhance>
	<div class="bar">
		<a class="cancel" href="/tanks/{data.tank.id}/livestock">Cancel</a>
		<h1>Add livestock</h1>
		<button class="save-top">Add</button>
	</div>
	<div class="body">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
		<div class="segmented" role="group" aria-label="Kind">
			<label><input type="radio" name="kind" value="fish" bind:group={kind} />Fish</label>
			<label><input type="radio" name="kind" value="invert" bind:group={kind} />Invert</label>
			<label><input type="radio" name="kind" value="coral" bind:group={kind} />Coral</label>
		</div>

		{#key kind}<SpeciesInput {kind} water={data.water} initialName={form?.values?.name ?? ''} initialScientific={form?.values?.scientificName ?? ''} invalid={!!form?.error} />{/key}

		<div class="field">
			<label class="label" for="count-in">Count</label>
			<div class="stepper">
				<button type="button" aria-label="Fewer" onclick={() => (count = Math.max(1, count - 1))}>−</button>
				<input id="count-in" name="count" inputmode="numeric" bind:value={count} />
				<button type="button" aria-label="More" onclick={() => (count = count + 1)}>+</button>
			</div>
		</div>

		<div class="field">
			<label class="label" for="added">Added</label>
			<input class="input" id="added" name="addedAt" type="date" max={data.today} defaultValue={data.today} />
		</div>

		<fieldset class="field">
			<legend class="label">Status</legend>
			<div class="segmented">
				<label><input type="radio" name="status" value="in_tank" defaultChecked />In tank</label>
				<label><input type="radio" name="status" value="quarantine" />Quarantine</label>
			</div>
		</fieldset>

		<div class="field">
			<label class="label" for="source">Source · optional</label>
			<input class="input" id="source" name="source" maxlength="120" placeholder="Store, breeder, price" />
		</div>

		<p class="hint">
			Adds a “Livestock added” entry to History. The species list is bundled with the app and works offline; custom names are always
			allowed.
		</p>
		<button class="btn btn-primary btn-lg">Add</button>
	</div>
</form>

<style>
	.lform {
		max-width: 560px;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
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
		padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 18px;
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
	.stepper {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.stepper button {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		border: 1px solid var(--border-strong);
		font-size: 22px;
	}
	.stepper input {
		width: 80px;
		height: 52px;
		text-align: center;
		font-size: 20px;
		font-weight: 600;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.5;
	}
</style>
