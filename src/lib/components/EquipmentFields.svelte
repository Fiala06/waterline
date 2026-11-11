<script lang="ts">
	// Equipment: what changed, on which item, and why. New entries pick from the tank's equipment.
	import { EQUIPMENT_ACTIONS, EQUIPMENT_REASONS } from '$lib/events';

	let {
		action = $bindable('adjusted'),
		equipmentId = $bindable(''),
		item = '',
		reasons = [],
		errors = {},
		equipment = []
	}: {
		action?: string;
		/** the item picked from the tank's equipment; '' is "Something else…" */
		equipmentId?: string;
		item?: string;
		reasons?: string[];
		errors?: Record<string, string>;
		/** New entries: the tank's equipment, to pick from */
		equipment?: { id: string; name: string }[];
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
		<select class="input" id="equipmentId" name="equipmentId" bind:value={equipmentId}>
			{#each equipment as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
			<option value="">Something else…</option>
		</select>
	</div>
{/if}
<div class="field" hidden={!!equipment.length && equipmentId !== ''}>
	<label class="label" for="item">{equipment.length ? 'Name' : 'Item'}</label>
	<input class="input" id="item" name="item" defaultValue={item} maxlength="80" placeholder="e.g. Canister filter" aria-invalid={!!errors.item} />
	{#if errors.item}<span class="error-text">✕ {errors.item}</span>{/if}
</div>
<fieldset class="field">
	<legend class="label">Why</legend>
	<div class="chips">
		{#each EQUIPMENT_REASONS as r (r)}
			<label class="chip pick"><input type="checkbox" name="reasons" value={r} defaultChecked={reasons.includes(r)} />{r}</label>
		{/each}
	</div>
</fieldset>

<style>
	.segmented label {
		min-height: 40px;
		font-size: 14px;
	}
</style>
