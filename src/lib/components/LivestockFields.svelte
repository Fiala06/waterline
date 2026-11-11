<script lang="ts">
	// G3 · Livestock / plants. New entries add to or take from the tank's lists
	// (with the inventory); edits, and entries without it, keep the plain fields.
	import { tick, untrack } from 'svelte';
	import { LIVESTOCK_ACTIONS, LIVESTOCK_STATUS } from '$lib/events';
	import CountStepper from './CountStepper.svelte';
	import SpeciesInput from './SpeciesInput.svelte';
	import { livestockPreview } from './event-form';

	type Inventory = {
		livestock: { id: string; name: string; count: number; status?: string; scientific?: string | null }[];
		plants: { id: string; name: string }[];
	};
	let {
		mode,
		inventory = null,
		action = '',
		status = '',
		count: initialCount = '',
		name = '',
		errors = {},
		water = null,
		preview = $bindable(null)
	}: {
		mode: 'new' | 'edit';
		/** New entries: the tank's livestock and plants, so the entry changes them */
		inventory?: Inventory | null;
		action?: string;
		status?: string;
		count?: string;
		name?: string;
		errors?: Record<string, string>;
		water?: 'fresh' | 'marine' | null;
		/** out: "Livestock tab: Ember tetra 0 → 10 · 41 animals total", shown under the photos */
		preview?: ReturnType<typeof livestockPreview> | null;
	} = $props();

	const linked = $derived(!!inventory);
	let lsAction = $state(untrack(() => action || 'added'));
	let lsKind = $state<'fish' | 'invert' | 'coral' | 'plant'>('fish');
	let lsTarget = $state('');
	let lsStatus = $state(untrack(() => status || 'in_tank'));
	let count = $state(untrack(() => initialCount || (mode === 'new' ? '1' : '')));
	let species = $state({ name: '', scientific: '' });
	let speciesBox: HTMLElement | undefined = $state();
	const targetIsLivestock = $derived(lsTarget.startsWith('livestock:'));
	const targetAnimal = $derived(targetIsLivestock ? inventory?.livestock.find((l) => l.id === lsTarget.slice('livestock:'.length)) : undefined);

	// Adding starts at 1; taking away can't go past what's in the tank.
	const countMin = $derived(linked ? 1 : 0);
	const countMax = $derived(linked && lsAction === 'removed' ? (targetAnimal?.count ?? null) : null);

	// The species field is its own component: read what it holds after each change.
	function readSpecies() {
		setTimeout(() => {
			const box = speciesBox;
			if (!box) return;
			const name = box.querySelector<HTMLInputElement>('input[name="name"]')?.value.trim() ?? '';
			const scientific = box.querySelector<HTMLInputElement>('input[name="scientificName"]')?.value ?? '';
			species = { name, scientific };
		});
	}
	$effect(() => {
		void lsKind;
		void lsAction;
		tick().then(readSpecies);
	});

	$effect(() => {
		preview = inventory
			? livestockPreview(inventory.livestock, { action: lsAction, kind: lsKind, status: lsStatus, count, species, target: targetAnimal })
			: null;
	});
</script>

{#if inventory}
	<input type="hidden" name="linked" value="1" />
	<fieldset class="seg-field">
		<legend class="sr-only">Change</legend>
		<div class="segmented">
			{#each LIVESTOCK_ACTIONS as a (a.value)}
				<label><input type="radio" name="action" value={a.value} bind:group={lsAction} onchange={() => (count = '1')} />{a.label}</label>
			{/each}
		</div>
	</fieldset>
	{#if lsAction === 'added'}
		<div class="segmented" role="group" aria-label="Kind">
			{#each [['fish', 'Fish'], ['invert', 'Invert'], ['coral', 'Coral'], ['plant', 'Plant']] as [k, l] (k)}
				<label><input type="radio" name="kind" value={k} bind:group={lsKind} />{l}</label>
			{/each}
		</div>
		<div class="species" bind:this={speciesBox} oninput={readSpecies} onclick={readSpecies} onkeyup={readSpecies} onfocusout={readSpecies} role="presentation">
			{#key lsKind}<SpeciesInput kind={lsKind} water={lsKind === 'plant' ? 'fresh' : water} invalid={!!errors.name} />{/key}
		</div>
		{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
		{#if lsKind === 'plant'}
			<div class="field">
				<label class="label" for="position">Position</label>
				<select class="input" id="position" name="position">
					<option value="background">Background</option>
					<option value="midground" selected>Midground</option>
					<option value="foreground">Foreground</option>
					<option value="epiphyte">Epiphyte</option>
					<option value="floating">Floating</option>
				</select>
			</div>
		{:else}
			<div class="pair">
				<div class="field">
					<label class="label" for="count">Count</label>
					<CountStepper bind:value={count} min={countMin} invalid={!!errors.count} />
					{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="status">Status</label>
					<select class="input" id="status" name="status" bind:value={lsStatus}>
						{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
					</select>
				</div>
			</div>
		{/if}
	{:else}
		<div class="field">
			<label class="label" for="target">Which one?</label>
			<select class="input" id="target" name="target" bind:value={lsTarget} aria-invalid={!!errors.target}>
				<option value="" disabled>Choose…</option>
				{#if inventory.livestock.length}
					<optgroup label="Livestock">
						{#each inventory.livestock as l (l.id)}<option value="livestock:{l.id}">{l.name} ({l.count})</option>{/each}
					</optgroup>
				{/if}
				{#if inventory.plants.length}
					<optgroup label="Plants">
						{#each inventory.plants as p (p.id)}<option value="plant:{p.id}">{p.name}</option>{/each}
					</optgroup>
				{/if}
			</select>
			{#if !inventory.livestock.length && !inventory.plants.length}<span class="hint">Nothing in this tank yet.</span>{/if}
			{#if errors.target}<span class="error-text">✕ {errors.target}</span>{/if}
		</div>
		{#if lsAction === 'removed' && targetIsLivestock}
			<div class="pair">
				<div class="field">
					<label class="label" for="count">How many</label>
					<CountStepper bind:value={count} min={countMin} max={countMax} invalid={!!errors.count} />
					{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
				</div>
				<fieldset class="field">
					<legend class="label">Why</legend>
					<div class="segmented">
						<label><input type="radio" name="reason" value="loss" defaultChecked />Loss</label>
						<label><input type="radio" name="reason" value="rehomed" />Rehomed</label>
					</div>
				</fieldset>
			</div>
		{/if}
	{/if}
{:else}
	<fieldset class="seg-field">
		<legend class="sr-only">Change</legend>
		<div class="segmented">
			{#each LIVESTOCK_ACTIONS as a (a.value)}
				<label><input type="radio" name="action" value={a.value} defaultChecked={(action || 'added') === a.value} />{a.label}</label>
			{/each}
		</div>
		{#if errors.action}<span class="error-text">✕ {errors.action}</span>{/if}
	</fieldset>
	<div class="field">
		<label class="label" for="name">Species</label>
		<input class="input" id="name" name="name" defaultValue={name} maxlength="80" placeholder="e.g. Ember tetra" aria-invalid={!!errors.name} />
		{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
	</div>
	<div class="pair">
		<div class="field">
			<label class="label" for="count">Count</label>
			<CountStepper bind:value={count} min={countMin} invalid={!!errors.count} />
			{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="status">Status</label>
			<select class="input" id="status" name="status" bind:value={lsStatus}>
				{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
			</select>
		</div>
	</div>
{/if}

<style>
	.segmented label {
		min-height: 40px;
		font-size: 14px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
</style>
