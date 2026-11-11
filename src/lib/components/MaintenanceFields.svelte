<script lang="ts">
	// G2 · Maintenance: what was done, and on which piece of equipment.
	import { MAINTENANCE_ACTIONS } from '$lib/events';

	let {
		actions = [],
		errors = {},
		equipment = []
	}: {
		/** the actions ticked */
		actions?: string[];
		errors?: Record<string, string>;
		/** New entries: the tank's equipment, to say which one */
		equipment?: { id: string; name: string }[];
	} = $props();
</script>

<fieldset class="field">
	<legend class="label">What did you do?</legend>
	<div class="chips">
		{#each MAINTENANCE_ACTIONS as a (a)}
			<label class="chip pick"><input type="checkbox" name="actions" value={a} defaultChecked={actions.includes(a)} />{a}</label>
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
