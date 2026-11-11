<script lang="ts">
	// Livestock / plants (G3). New entries add to or take from the tank's lists
	// (`inventory`); an edit, or a tank's entry without them, is typed. EventForm
	// previews the counts from what's bound here.
	import { tick } from 'svelte';
	import { LIVESTOCK_ACTIONS, LIVESTOCK_STATUS } from '$lib/events';
	import SpeciesInput from '../SpeciesInput.svelte';
	import { stepCount, targetAnimal, valueOf, type Animal, type FormValues } from '../event-form';

	let {
		action = $bindable(),
		kind = $bindable(),
		status = $bindable(),
		count = $bindable(),
		target = $bindable(),
		species = $bindable(),
		values,
		errors,
		inventory,
		water
	}: {
		/** added or removed (new entries) */
		action: string;
		kind: 'fish' | 'invert' | 'coral' | 'plant';
		status: string;
		count: string;
		/** "Which one?": `livestock:<id>` or `plant:<id>` */
		target: string;
		/** what the species field holds */
		species: { name: string; scientific: string };
		values: FormValues;
		errors: Record<string, string>;
		/** new entries: the tank's livestock and plants; null when it's typed */
		inventory: { livestock: Animal[]; plants: { id: string; name: string }[] } | null;
		water: 'fresh' | 'marine' | null;
	} = $props();

	let speciesBox: HTMLElement | undefined = $state();
	const linked = $derived(!!inventory);
	const targetIsLivestock = $derived(target.startsWith('livestock:'));

	// − 10 + (G3). Adding starts at 1; taking away can't go past what's in the tank.
	const countMin = $derived(linked ? 1 : 0);
	const countMax = $derived(linked && action === 'removed' ? (targetAnimal(inventory?.livestock ?? [], target)?.count ?? null) : null);
	const countN = $derived(parseInt(count, 10));
	const step = (d: number) => (count = stepCount(count, d, countMin, countMax));

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
		void kind;
		void action;
		tick().then(readSpecies);
	});
</script>

{#snippet stepper(label: string)}
	<div class="field">
		<label class="label" for="count">{label}</label>
		<div class="count-stepper stepper">
			<button type="button" aria-label="One fewer" disabled={!Number.isNaN(countN) && countN <= countMin} onclick={() => step(-1)}>−</button>
			<input id="count" name="count" inputmode="numeric" autocomplete="off" bind:value={count} aria-invalid={!!errors.count} />
			<button type="button" aria-label="One more" disabled={countMax != null && !Number.isNaN(countN) && countN >= countMax} onclick={() => step(1)}>+</button>
		</div>
		{#if errors.count}<span class="error-text">✕ {errors.count}</span>{/if}
	</div>
{/snippet}

{#snippet statusField()}
	<div class="field">
		<label class="label" for="status">Status</label>
		<select class="input" id="status" name="status" bind:value={status}>
			{#each LIVESTOCK_STATUS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
		</select>
	</div>
{/snippet}

{#if inventory}
	<input type="hidden" name="linked" value="1" />
	<fieldset class="seg-field">
		<legend class="sr-only">Change</legend>
		<div class="segmented">
			{#each LIVESTOCK_ACTIONS as a (a.value)}
				<label><input type="radio" name="action" value={a.value} bind:group={action} onchange={() => (count = '1')} />{a.label}</label>
			{/each}
		</div>
	</fieldset>
	{#if action === 'added'}
		<div class="segmented" role="group" aria-label="Kind">
			{#each [['fish', 'Fish'], ['invert', 'Invert'], ['coral', 'Coral'], ['plant', 'Plant']] as [k, l] (k)}
				<label><input type="radio" name="kind" value={k} bind:group={kind} />{l}</label>
			{/each}
		</div>
		<div class="species" bind:this={speciesBox} oninput={readSpecies} onclick={readSpecies} onkeyup={readSpecies} onfocusout={readSpecies} role="presentation">
			{#key kind}<SpeciesInput {kind} water={kind === 'plant' ? 'fresh' : water} invalid={!!errors.name} />{/key}
		</div>
		{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
		{#if kind === 'plant'}
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
				{@render stepper('Count')}
				{@render statusField()}
			</div>
		{/if}
	{:else}
		<div class="field">
			<label class="label" for="target">Which one?</label>
			<select class="input" id="target" name="target" bind:value={target} aria-invalid={!!errors.target}>
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
		{#if action === 'removed' && targetIsLivestock}
			<div class="pair">
				{@render stepper('How many')}
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
				<label><input type="radio" name="action" value={a.value} defaultChecked={(valueOf(values, 'action') || 'added') === a.value} />{a.label}</label>
			{/each}
		</div>
		{#if errors.action}<span class="error-text">✕ {errors.action}</span>{/if}
	</fieldset>
	<div class="field">
		<label class="label" for="name">Species</label>
		<input class="input" id="name" name="name" defaultValue={valueOf(values, 'name')} maxlength="80" placeholder="e.g. Ember tetra" aria-invalid={!!errors.name} />
		{#if errors.name}<span class="error-text">✕ {errors.name}</span>{/if}
	</div>
	<div class="pair">
		{@render stepper('Count')}
		{@render statusField()}
	</div>
{/if}

<style>
	legend {
		margin-bottom: 8px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	/* ── Segmented choices ── */
	.segmented label {
		min-height: 40px;
		font-size: 14px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.stepper {
		display: flex;
		width: 100%;
		height: 48px;
	}
	.stepper button {
		width: 48px;
		flex-shrink: 0;
		font-size: 22px;
	}
	.stepper input {
		flex: 1;
		align-self: stretch; /* the whole middle is the tap target */
		width: auto;
		min-width: 0;
		font-size: 18px;
		font-weight: 800;
	}

	@media (min-width: 1024px) {
		legend {
			margin-bottom: 6px;
		}
	}
</style>
