<script lang="ts">
	// T3 · Add / edit equipment. Fields adapt to the type.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { untrack } from 'svelte';
	import { EQUIPMENT_TYPE_LABEL, EQUIPMENT_TYPES, SPEC_FIELDS, SUGGESTED_TASK, specUnit, type EquipmentType } from '$lib/equipment';
	import type { UnitPrefs } from '$lib/units';

	let {
		mode,
		values,
		errors = {},
		brands = [],
		prefs,
		cancelHref
	}: {
		mode: 'new' | 'edit';
		values: {
			type: EquipmentType;
			brand: string;
			model: string;
			installedAt: string;
			notes: string;
			specs: Record<string, string>;
		};
		errors?: Record<string, string>;
		brands?: { brand: string; tankName: string }[];
		prefs: UnitPrefs;
		cancelHref: string;
	} = $props();

	let type = $state<EquipmentType>(untrack(() => values.type));
	let brand = $state(untrack(() => values.brand));
	let model = $state(untrack(() => values.model));
	let notes = $state(untrack(() => values.notes));
	const specs = $state<Record<string, string>>(untrack(() => ({ ...values.specs })));
	let busy = $state(false);
	const suggestion = $derived(SUGGESTED_TASK[type]);
	const brandMatches = $derived(
		brand.length >= 2 ? brands.filter((b) => b.brand.toLowerCase().startsWith(brand.toLowerCase()) && b.brand !== brand).slice(0, 3) : []
	);
</script>

<form
	method="POST"
	action="?/save"
	class="eqform"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="bar">
		<a class="cancel" href={cancelHref}>Cancel</a>
		<h1>{mode === 'edit' ? 'Edit equipment' : 'Add equipment'}</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		<fieldset class="field">
			<legend class="label">Type</legend>
			<div class="types">
				{#each EQUIPMENT_TYPES as t (t)}
					<label class="option"><input type="radio" name="type" value={t} bind:group={type} />{EQUIPMENT_TYPE_LABEL[t]}</label>
				{/each}
			</div>
		</fieldset>

		<div class="pair">
			<div class="field">
				<label class="label" for="eq-brand">Brand</label>
				<input class="input" id="eq-brand" name="brand" bind:value={brand} maxlength="60" autocomplete="off" aria-invalid={!!errors.brand} />
				{#if brandMatches.length}
					<div class="suggest">
						{#each brandMatches as b (b.brand)}
							<button type="button" onclick={() => (brand = b.brand)}>{b.brand} <span class="muted">· used in {b.tankName}</span></button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="field">
				<label class="label" for="eq-model">Model</label>
				<input class="input" id="eq-model" name="model" bind:value={model} maxlength="60" autocomplete="off" />
			</div>
		</div>
		{#if errors.brand}<span class="error-text">✕ {errors.brand}</span>{/if}

		{#each SPEC_FIELDS[type] as f (`${type}.${f.key}`)}
			<div class="field">
				<label class="label" for="spec-{f.key}">{f.label}</label>
				{#if f.kind === 'select'}
					<select class="input" id="spec-{f.key}" name="spec.{f.key}" bind:value={specs[`${type}.${f.key}`]}>
						<option value="">—</option>
						{#each f.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
					</select>
				{:else if f.kind === 'number'}
					<div class="unit-input">
						<input id="spec-{f.key}" name="spec.{f.key}" inputmode="decimal" bind:value={specs[`${type}.${f.key}`]} />
						<span class="unit">{specUnit(f, prefs)}</span>
					</div>
				{:else}
					<input class="input" id="spec-{f.key}" name="spec.{f.key}" bind:value={specs[`${type}.${f.key}`]} maxlength="80" placeholder={f.placeholder} />
				{/if}
				{#if errors[`spec.${f.key}`]}<span class="error-text">✕ {errors[`spec.${f.key}`]}</span>{/if}
			</div>
		{/each}

		<div class="field">
			<label class="label" for="eq-installed">Installed</label>
			<input class="input" id="eq-installed" name="installedAt" type="date" defaultValue={values.installedAt} />
		</div>
		<div class="field">
			<label class="label" for="eq-notes">Notes</label>
			<textarea class="input" id="eq-notes" name="notes" rows="2" maxlength="2000" placeholder="Media, settings, where you bought it" bind:value={notes}></textarea>
		</div>

		{#if mode === 'new' && suggestion}
			<label class="check-row">
				<input type="checkbox" name="createTask" defaultChecked={type === 'filter'} />
				<span>Create a maintenance task: {suggestion.verb.toLowerCase()} every {suggestion.days % 7 === 0 ? `${suggestion.days / 7} weeks` : `${suggestion.days} days`}</span>
			</label>
		{/if}
		<p class="hint">Fields adapt to type: heaters get wattage, lights get photoperiod.</p>
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="btn btn-danger" popovertarget="confirm-eq-remove">Remove</button>
		{/if}
		<button class="btn btn-primary grow" disabled={busy}>Save</button>
	</div>
</form>

{#if mode === 'edit'}
	<ConfirmDelete
		id="confirm-eq-remove"
		trigger={false}
		title="Remove this equipment?"
		body="It moves to past equipment and a “Removed” entry is added to History. A reminder made for it is removed too."
		action="?/remove"
		label="Remove"
	/>
{/if}

<style>
	.eqform {
		max-width: 560px;
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
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
		flex: 1;
		padding: 12px 20px;
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
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.types .option {
		padding: 0 14px;
		min-height: 44px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.suggest {
		display: flex;
		flex-direction: column;
	}
	.suggest button {
		text-align: left;
		font-size: 14px;
		padding: 6px 2px;
		min-height: 32px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.foot {
		padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 10px;
	}
	.grow {
		flex: 1;
	}
</style>
