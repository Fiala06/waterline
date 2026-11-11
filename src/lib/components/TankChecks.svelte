<script lang="ts">
	// The tanks a token may use, as checkboxes named `tank` (#268: AI assistant and Sensors).
	let {
		prefix,
		legend,
		tanks,
		picked,
		error
	}: {
		/** keeps the error's id apart from the other lists' on the page */
		prefix: string;
		legend: string;
		tanks: { id: string; name: string; archived?: boolean }[];
		picked: Set<string>;
		error?: string;
	} = $props();
</script>

<fieldset class="tanks" aria-describedby={error ? `${prefix}-tanks-e` : undefined}>
	<legend class="label">{legend}</legend>
	<div class="checks">
		{#each tanks as t (t.id)}
			<label class="check-row"><input type="checkbox" name="tank" value={t.id} checked={picked.has(t.id)} /><span>{t.name}{t.archived ? ' · archived' : ''}</span></label>
		{/each}
	</div>
	{#if error}<span class="error-text" id="{prefix}-tanks-e">✕ {error}</span>{/if}
</fieldset>

<style>
	.tanks {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tanks legend {
		padding: 0;
		margin-bottom: 4px;
	}
	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0 18px;
	}
</style>
