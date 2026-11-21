<script lang="ts">
	// A top-off (#316): water added for what evaporated, not a water change. How
	// much (optional) and the source water; it never counts as a change.
	import { WATER_SOURCES } from '$lib/events';
	import { valueOf, type FormValues } from '../event-form';

	let { values, errors, volUnit }: { values: FormValues; errors: Record<string, string>; volUnit: string } = $props();
</script>

<div class="topoff">
	<div class="field">
		<label class="label" for="volume">Amount · optional</label>
		<div class="amount-box">
			<input id="volume" name="volume" inputmode="decimal" autocomplete="off" defaultValue={valueOf(values, 'volume')} placeholder="e.g. 2" aria-invalid={!!errors.volume} aria-describedby="topoff-hint" />
			<span class="unit" aria-hidden="true">{volUnit}</span>
		</div>
		<span class="hint" id="topoff-hint">Water added for what evaporated. It isn't counted as a water change.</span>
		{#if errors.volume}<span class="error-text">✕ {errors.volume}</span>{/if}
	</div>
	<fieldset class="field">
		<legend class="label">Source water</legend>
		<div class="options three">
			{#each WATER_SOURCES as s (s.value)}
				<label class="option"><input type="radio" name="source" value={s.value} checked={(valueOf(values, 'source') || 'rodi') === s.value} />{s.label}</label>
			{/each}
		</div>
	</fieldset>
</div>

<style>
	.topoff {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.amount-box {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 56px;
		padding: 0 14px;
		background: var(--surface);
		border: 1px solid var(--divider);
	}
	.amount-box:focus-within {
		border: 2px solid var(--accent);
		padding: 0 13px;
		background: var(--bg);
	}
	.amount-box:has(input[aria-invalid='true']) {
		border-color: var(--accent);
	}
	.amount-box input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 26px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.amount-box .unit {
		font-size: 15px;
		color: var(--text-muted);
	}
	.hint {
		font-size: 13px;
		color: var(--text-muted);
	}
	.three {
		grid-template-columns: repeat(3, 1fr);
	}
</style>
