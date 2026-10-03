<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/DateField.svelte';
	import SpeciesInput from '$lib/components/SpeciesInput.svelte';
	let { data, form } = $props();
	let kind = $state<'fish' | 'invert' | 'coral'>('fish');
	let count = $state(1);
	let addedAt = $state(untrack(() => data.today));

	// Care (#20): once a species is picked, its ranges and what to check against this tank, from FishBase when the server has it
	let picked = $state<{ s: string; name: string } | null>(null);
	let care = $state<{ care: { line: string; source: { name: string; url: string; license: string; licenseUrl: string } } | null; warnings: string[] } | null>(null);
	let seq = 0;
	$effect(() => {
		const p = picked;
		const n = Number(count) || 1;
		if (!p) {
			care = null;
			return;
		}
		const my = ++seq;
		const t = setTimeout(async () => {
			try {
				const r = await fetch(`/api/species/care?${new URLSearchParams({ s: p.s, name: p.name, count: String(n), tank: data.tank.id })}`);
				if (my === seq && r.ok) care = await r.json();
			} catch {
				/* offline: no hints */
			}
		}, 150);
		return () => clearTimeout(t);
	});
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

		{#key kind}<SpeciesInput {kind} water={data.water} initialName={form?.values?.name ?? ''} initialScientific={form?.values?.scientificName ?? ''} invalid={!!form?.error} onpick={(p) => (picked = p)} />{/key}
		{#if care && (care.care || care.warnings.length)}
			<div class="care" aria-live="polite">
				{#if care.care}
					<p class="care-line"><b>{picked?.name}</b> · {care.care.line}</p>
				{/if}
				{#each care.warnings as w (w)}<p class="care-warn">{w}</p>{/each}
				{#if care.care}
					<p class="care-src">Care ranges from <a href={care.care.source.url} target="_blank" rel="noopener noreferrer">{care.care.source.name}</a> · <a href={care.care.source.licenseUrl} target="_blank" rel="noopener noreferrer">{care.care.source.license}</a></p>
				{/if}
			</div>
		{/if}

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
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 800;
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
		border-radius: 0;
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
	/* care (#20): a plain block under the species, warnings in bold with their ▲ */
	.care {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px;
		border-left: 2px solid var(--ink);
		background: var(--surface);
	}
	.care p {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
	}
	.care-warn {
		font-weight: 700;
	}
	.care-src {
		color: var(--text-muted);
		font-size: 12px;
	}
	.care-src a {
		color: inherit;
		text-decoration: underline;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
	}
	.add {
		flex: 1;
		height: 56px;
		border-radius: 0;
		font-size: 17px;
	}
	/* Desktop: a flat form under the shell's title, 2px rule above the footer */
	@media (min-width: 1024px) {
		.lform {
			min-height: 0;
			max-width: 640px;
			padding: 24px 32px 40px;
		}
		.body {
			padding: 0;
		}
		.count-stepper {
			height: 44px;
		}
		.foot {
			margin-top: 20px;
			padding: 16px 0 0;
			border-top: 2px solid var(--divider);
			justify-content: flex-start;
			flex-direction: row-reverse;
		}
		.foot .btn {
			height: 44px;
			font-size: 14px;
		}
		.add {
			flex: none;
			padding: 0 22px;
		}
		.foot .hide-phone {
			border: none;
			color: var(--text-muted);
		}
	}
</style>
