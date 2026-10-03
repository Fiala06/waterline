<script lang="ts">
	// T3 · Add / edit equipment. Fields adapt to the type.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import { untrack } from 'svelte';
	import { EQUIPMENT_TYPE_LABEL, EQUIPMENT_TYPES, SPEC_FIELDS, SUGGESTED_TASK, specUnit, type EquipmentType } from '$lib/equipment';
	import type { UnitPrefs } from '$lib/units';

	let {
		mode,
		values,
		errors = {},
		brands = [],
		prefs,
		cancelHref,
		today
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
		/** YYYY-MM-DD in the user's time zone */
		today?: string;
	} = $props();

	let type = $state<EquipmentType>(untrack(() => values.type));
	let brand = $state(untrack(() => values.brand));
	let model = $state(untrack(() => values.model));
	let notes = $state(untrack(() => values.notes));
	let installedAt = $state(untrack(() => values.installedAt));
	const specs = $state<Record<string, string>>(untrack(() => ({ ...values.specs })));
	let busy = $state(false);
	const suggestion = $derived(SUGGESTED_TASK[type]);
	const fields = $derived(SPEC_FIELDS[type]);
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
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={cancelHref}>Cancel</a>
		<h1>{mode === 'edit' ? 'Edit equipment' : 'Add equipment'}</h1>
		<button class="save-top" disabled={busy}>Save</button>
	</div>

	<div class="body">
		<fieldset class="field">
			<legend class="label">Type</legend>
			<div class="chips">
				{#each EQUIPMENT_TYPES as t (t)}
					<label class="chip"><input type="radio" name="type" value={t} bind:group={type} />{EQUIPMENT_TYPE_LABEL[t]}</label>
				{/each}
			</div>
		</fieldset>

		<div class="brand">
			<div class="pair">
				<div class="field">
					<label class="label" for="eq-brand">Brand</label>
					<input class="input" id="eq-brand" name="brand" bind:value={brand} maxlength="60" autocomplete="off" aria-invalid={!!errors.brand} />
				</div>
				<div class="field">
					<label class="label" for="eq-model">Model</label>
					<input class="input" id="eq-model" name="model" bind:value={model} maxlength="60" autocomplete="off" />
				</div>
			</div>
			{#if brandMatches.length}
				<div class="suggest">
					{#each brandMatches as b (b.brand)}
						<button type="button" onclick={() => (brand = b.brand)}>
							<strong>{b.brand.slice(0, brand.length)}</strong>{b.brand.slice(brand.length)}<span class="muted">{' · used in ' + b.tankName}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if errors.brand}<span class="error-text">✕ {errors.brand}</span>{/if}
		</div>

		{#if fields.length}
			<!-- in pairs (Filter type + Flow rate); an odd one out takes the full width -->
			<div class="specs">
				{#each fields as f, i (`${type}.${f.key}`)}
					<div class="field" class:wide={i === fields.length - 1 && i % 2 === 0}>
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
			</div>
		{/if}

		<div class="field">
			<label class="label" for="eq-installed">Installed</label>
			<DateField name="installedAt" id="eq-installed" bind:value={installedAt} label="Installed" {today} max={today} invalid={!!errors.installedAt} />
			{#if errors.installedAt}<span class="error-text">✕ {errors.installedAt}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="eq-notes">Notes</label>
			<textarea class="input" id="eq-notes" name="notes" rows="2" maxlength="2000" placeholder="Media, settings, where you bought it" bind:value={notes}></textarea>
		</div>

		{#if mode === 'new' && suggestion}
			<label class="check-row task">
				<input type="checkbox" name="createTask" defaultChecked={type === 'filter'} />
				<span>Create a maintenance task: {suggestion.verb.toLowerCase()} every {suggestion.days % 7 === 0 ? `${suggestion.days / 7} weeks` : `${suggestion.days} days`}</span>
			</label>
		{/if}
		<p class="hint">Fields adapt to type: heaters get wattage, lights get photoperiod.</p>
	</div>

	<div class="foot">
		{#if mode === 'edit'}
			<button type="button" class="btn btn-danger remove" popovertarget="confirm-eq-remove">Remove</button>
		{/if}
		<a class="btn hide-phone" href={cancelHref}>Cancel</a>
		<button class="btn btn-primary save" disabled={busy}>Save</button>
	</div>
</form>

{#if mode === 'edit'}
	<ConfirmDelete
		id="confirm-eq-remove"
		trigger={false}
		title="Remove this equipment?"
		body={'It moves to past equipment and a "Removed" entry is added to History. A reminder made for it is removed too.'}
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
	.brand {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.pair,
	.specs {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 18px 12px;
	}
	.wide {
		grid-column: 1 / -1;
	}
	/* T3: brands used in other tanks, under both fields */
	.suggest {
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.suggest button {
		min-height: 44px;
		padding: 10px 14px;
		text-align: left;
		font-size: 14px;
	}
	.suggest button + button {
		border-top: 1px solid var(--border);
	}
	.suggest button:hover {
		background: var(--surface-hi);
	}
	.task {
		padding: 12px 14px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 14px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-faint);
		text-align: center;
	}
	.foot {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 10px;
	}
	.foot .btn {
		height: 56px;
		border-radius: 0;
		font-size: 17px;
	}
	.save {
		flex: 1;
	}
	/* Desktop: the form as a centered card (header has the title) */
	@media (min-width: 1024px) {
		.eqform {
			min-height: 0;
			max-width: 640px;
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 0;
		}
		.body {
			padding: 0;
		}
		/* recessed fields on the card (D13), the date field too; background-color keeps the select's ▾ */
		.eqform :global(.input),
		.unit-input,
		.task {
			background-color: var(--surface-2);
			border-color: var(--border-strong);
		}
		.eqform :global(.input:focus),
		.unit-input:focus-within {
			border-color: var(--accent);
		}
		.suggest {
			background: var(--surface-2);
		}
		.hint {
			text-align: left;
		}
		.foot {
			margin-top: 24px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			justify-content: flex-end;
			gap: 12px;
		}
		.foot .btn {
			height: 44px;
			border-radius: 0;
			font-size: 15px;
		}
		.remove {
			margin-right: auto;
		}
		.save {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
