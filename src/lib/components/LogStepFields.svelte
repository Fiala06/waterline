<script lang="ts" module>
	export interface StepValues {
		label: string;
		kind: string;
		amountMode: string;
		amount: string;
		source: string;
		product: string;
		unit: string;
		food: string;
		actions: string[];
	}
	export const BLANK_STEP: StepValues = { label: '', kind: 'water_change', amountMode: 'percent', amount: '', source: 'tap', product: '', unit: '', food: '', actions: [] };
</script>

<script lang="ts">
	// The fields of a log step (a routine's step, #92): what it logs, then the
	// fields that kind takes (CSS :has shows them, so it works without scripts),
	// then its name. The same shape as a Quick log favorite; the server reads
	// wcAmount, doseAmount · doseUnit and feedAmount · feedUnit per kind, since
	// every kind's inputs are in the form and hidden ones post too.
	import { DOSING_UNITS, MAINTENANCE_ACTIONS, WATER_SOURCES } from '$lib/events';
	import { FAVORITE_KIND_LABEL, FAVORITE_KINDS } from '$lib/favorites';

	let { prefix, v, err = {}, volUnit }: { prefix: string; v: StepValues; err?: Record<string, string>; volUnit: string } = $props();
</script>

<fieldset class="field">
	<legend class="label">Logs</legend>
	<div class="chips" role="radiogroup" aria-label="What it logs">
		{#each FAVORITE_KINDS as k (k)}
			<label class="chip pick"><input type="radio" name="kind" value={k} checked={v.kind === k} />{FAVORITE_KIND_LABEL[k]}</label>
		{/each}
	</div>
	{#if err.kind}<span class="error-text">✕ {err.kind}</span>{/if}
</fieldset>

<div class="kind-fields for-water_change">
	<fieldset class="field">
		<legend class="label">Amount · optional</legend>
		<div class="inline">
			<input class="input num" name="wcAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="40" aria-label="Amount" aria-invalid={!!err.amount} />
			<div class="segmented" role="radiogroup" aria-label="Percent or volume">
				<label><input type="radio" name="amountMode" value="percent" checked={v.amountMode !== 'volume'} />%</label>
				<label><input type="radio" name="amountMode" value="volume" checked={v.amountMode === 'volume'} />{volUnit}</label>
			</div>
		</div>
		{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
	</fieldset>
	<fieldset class="field">
		<legend class="label">Source water</legend>
		<div class="chips" role="radiogroup" aria-label="Source water">
			{#each WATER_SOURCES as s (s.value)}
				<label class="chip pick"><input type="radio" name="source" value={s.value} checked={v.source === s.value} />{s.label}</label>
			{/each}
		</div>
	</fieldset>
</div>

<div class="kind-fields for-dosing">
	<div class="field">
		<label class="label" for="{prefix}-product">Product</label>
		<input class="input" id="{prefix}-product" name="product" maxlength="80" value={v.product} autocomplete="off" placeholder="e.g. Thrive" aria-invalid={!!err.product} />
		{#if err.product}<span class="error-text">✕ {err.product}</span>{/if}
	</div>
	<fieldset class="field">
		<legend class="label">Amount · optional</legend>
		<div class="inline">
			<input class="input num" name="doseAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="5" aria-label="Amount" aria-invalid={!!err.amount} />
			<select class="input unit" name="doseUnit" aria-label="Unit">
				{#each DOSING_UNITS as u (u)}<option value={u} selected={(v.unit || 'mL') === u}>{u}</option>{/each}
			</select>
		</div>
		{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
	</fieldset>
</div>

<div class="kind-fields for-feeding">
	<div class="field">
		<label class="label" for="{prefix}-food">Food · optional</label>
		<input class="input" id="{prefix}-food" name="food" maxlength="80" value={v.food} autocomplete="off" placeholder="e.g. Frozen bloodworms" />
	</div>
	<fieldset class="field">
		<legend class="label">Amount · optional</legend>
		<div class="inline">
			<input class="input num" name="feedAmount" inputmode="decimal" value={v.amount} autocomplete="off" placeholder="1" aria-label="Amount" aria-invalid={!!err.amount} />
			<input class="input unit" name="feedUnit" maxlength="20" value={v.unit} autocomplete="off" placeholder="cubes, pinches" aria-label="Unit" />
		</div>
		{#if err.amount}<span class="error-text">✕ {err.amount}</span>{/if}
	</fieldset>
</div>

<fieldset class="field kind-fields for-maintenance">
	<legend class="label">Done · optional</legend>
	<div class="chips">
		{#each MAINTENANCE_ACTIONS as a (a)}
			<label class="chip pick"><input type="checkbox" name="actions" value={a} checked={v.actions.includes(a)} />{a}</label>
		{/each}
	</div>
</fieldset>

<div class="field">
	<label class="label" for="{prefix}-label">Name · optional</label>
	<input class="input" id="{prefix}-label" name="label" maxlength="60" value={v.label} autocomplete="off" placeholder="Named from the fields if blank" />
</div>

<style>
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.inline {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.num {
		width: 96px;
	}
	.unit {
		width: 140px;
	}
	/* the fields follow the kind picked above; a browser without :has shows them all */
	.kind-fields {
		display: none;
		flex-direction: column;
		gap: 14px;
	}
	:global(form:has(input[name='kind'][value='water_change']:checked)) .for-water_change,
	:global(form:has(input[name='kind'][value='dosing']:checked)) .for-dosing,
	:global(form:has(input[name='kind'][value='feeding']:checked)) .for-feeding,
	:global(form:has(input[name='kind'][value='maintenance']:checked)) .for-maintenance {
		display: flex;
	}
	@supports not selector(:has(a)) {
		.kind-fields {
			display: flex;
		}
	}
</style>
