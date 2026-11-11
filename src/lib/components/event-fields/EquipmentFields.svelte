<script lang="ts">
	// Equipment: what changed, on which item (new entries pick one of the tank's), and why.
	import { EQUIPMENT_ACTIONS, EQUIPMENT_REASONS } from '$lib/events';
	import { listOf, valueOf, type FormValues } from '../event-form';

	let {
		action = $bindable(),
		item = $bindable(),
		values,
		errors,
		equipment
	}: {
		/** added, adjusted, removed… (EventForm's hint reads it) */
		action: string;
		/** the tank's item picked, '' for "Something else…" */
		item: string;
		values: FormValues;
		errors: Record<string, string>;
		/** new entries: the tank's equipment, to pick one (none: the Item is typed) */
		equipment: { id: string; name: string }[];
	} = $props();
</script>

<fieldset class="seg-field">
	<legend class="sr-only">Change</legend>
	<div class="segmented">
		{#each EQUIPMENT_ACTIONS as a (a.value)}
			<label><input type="radio" name="action" value={a.value} bind:group={action} />{a.label}</label>
		{/each}
	</div>
	{#if errors.action}<span class="error-text">✕ {errors.action}</span>{/if}
</fieldset>
{#if equipment.length}
	<div class="field">
		<label class="label" for="equipmentId">Item</label>
		<select class="input" id="equipmentId" name="equipmentId" bind:value={item}>
			{#each equipment as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
			<option value="">Something else…</option>
		</select>
	</div>
{/if}
<div class="field" hidden={!!equipment.length && item !== ''}>
	<label class="label" for="item">{equipment.length ? 'Name' : 'Item'}</label>
	<input class="input" id="item" name="item" defaultValue={valueOf(values, 'item')} maxlength="80" placeholder="e.g. Canister filter" aria-invalid={!!errors.item} />
	{#if errors.item}<span class="error-text">✕ {errors.item}</span>{/if}
</div>
<fieldset class="field">
	<legend class="label">Why</legend>
	<div class="chips">
		{#each EQUIPMENT_REASONS as r (r)}
			<label class="chip pick"><input type="checkbox" name="reasons" value={r} defaultChecked={listOf(values, 'reasons').includes(r)} />{r}</label>
		{/each}
	</div>
</fieldset>

<style>
	legend {
		margin-bottom: 8px;
	}
	/* ── Pick-any chips ── */
	.pick {
		height: 40px;
	}
	/* ── Segmented choices ── */
	.segmented label {
		min-height: 40px;
		font-size: 14px;
	}

	@media (min-width: 1024px) {
		legend {
			margin-bottom: 6px;
		}
	}
</style>
