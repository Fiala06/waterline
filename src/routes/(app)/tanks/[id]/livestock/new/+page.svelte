<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/DateField.svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	let { data, form } = $props();
	let kind = $state<'fish' | 'invert' | 'coral'>('fish');
	let count = $state(1);
	let addedAt = $state(untrack(() => data.today));
</script>

<svelte:head><title>Add livestock · {data.tank.name}</title></svelte:head>

<form method="POST" class="lform" use:enhance>
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
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

		<!-- T5: Count and Added side by side -->
		<div class="pair">
			<div class="field">
				<label class="label" for="count-in">Count</label>
				<div class="count-stepper">
					<!-- typing makes it a string, hence Number() -->
					<button type="button" aria-label="Fewer" disabled={Number(count) <= 1} onclick={() => (count = Math.max(1, Number(count) - 1))}>−</button>
					<input id="count-in" name="count" inputmode="numeric" bind:value={count} />
					<button type="button" aria-label="More" onclick={() => (count = (Number(count) || 0) + 1)}>+</button>
				</div>
			</div>
			<div class="field">
				<label class="label" for="added">Added</label>
				<DateField name="addedAt" id="added" bind:value={addedAt} label="Added" today={data.today} max={data.today} required />
			</div>
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
			Adds a "Livestock added" entry to History. The species list is bundled with the app and works offline; custom names are always
			allowed.
		</p>
	</div>
	<div class="foot">
		<a class="btn hide-phone" href="/tanks/{data.tank.id}/livestock">Cancel</a>
		<button class="btn btn-primary add">Add</button>
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
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.save-top {
		justify-self: end;
		color: var(--accent);
		font-weight: 700;
		font-size: 16px;
		min-height: 44px;
	}
	.body {
		flex: 1;
		padding: 8px 20px 12px;
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
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
	}
	/* T5: the stepper fills its half, as tall as the inputs */
	.count-stepper {
		display: flex;
		width: 100%;
		height: 52px;
		padding: 0 4px;
		background: var(--surface);
		border-color: var(--border);
	}
	.count-stepper input {
		flex: 1;
		align-self: stretch;
		width: 0;
		font-size: 18px;
		font-weight: 700;
	}
	.count-stepper button {
		font-size: 22px;
		color: var(--text-2);
		border-radius: 10px;
	}
	.count-stepper button:disabled {
		color: var(--placeholder);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
		line-height: 1.5;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
	}
	.add {
		flex: 1;
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}
	/* Desktop: the form as a centered card (header has the title) */
	@media (min-width: 1024px) {
		.lform {
			min-height: 0;
			max-width: 640px;
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 20px;
		}
		.body {
			padding: 0;
		}
		/* recessed fields on the card (D13); background-color keeps the select's ▾ */
		.lform :global(.input),
		.count-stepper {
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.lform :global(.input:focus) {
			border-color: var(--accent);
		}
		.segmented {
			background: var(--surface-2);
		}
		.foot {
			margin-top: 24px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			justify-content: flex-end;
		}
		.foot .btn {
			height: 44px;
			border-radius: 12px;
			font-size: 15px;
		}
		.add {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
