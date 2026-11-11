<script lang="ts">
	// Maintenance: what was done, and on which piece of equipment.
	import { MAINTENANCE_ACTIONS } from '$lib/events';
	import { listOf, type FormValues } from '../event-form';

	let {
		values,
		errors,
		equipment
	}: {
		values: FormValues;
		errors: Record<string, string>;
		/** new entries: the tank's equipment, to pick one (none: no field) */
		equipment: { id: string; name: string }[];
	} = $props();
</script>

<fieldset class="field">
	<legend class="label">What did you do?</legend>
	<div class="chips">
		{#each MAINTENANCE_ACTIONS as a (a)}
			<label class="chip pick"><input type="checkbox" name="actions" value={a} defaultChecked={listOf(values, 'actions').includes(a)} />{a}</label>
		{/each}
	</div>
	{#if errors.actions}<span class="error-text">✕ {errors.actions}</span>{/if}
</fieldset>
{#if equipment.length}
	<div class="field">
		<label class="label" for="m-equipment">Equipment · optional</label>
		<select class="input" id="m-equipment" name="equipmentId">
			<option value="">—</option>
			{#each equipment as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
		</select>
	</div>
{/if}

<style>
	legend {
		margin-bottom: 8px;
	}
	/* ── Pick-any chips ── */
	.pick {
		height: 40px;
	}

	@media (min-width: 1024px) {
		legend {
			margin-bottom: 6px;
		}
	}
</style>
