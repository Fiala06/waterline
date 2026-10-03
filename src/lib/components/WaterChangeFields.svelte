<script lang="ts">
	// 14 · Water change amount (% or volume, with presets) and source water.
	// The log event form uses it as is; the water test's "Also log a water
	// change" card uses it `compact`, sized like the readings around it.
	import { DOSING_UNITS, WATER_SOURCES } from '$lib/events';
	import { formatNumber, parseNumber } from '$lib/units';
	import { TIPS } from '$lib/tips';
	import Tip from './Tip.svelte';

	let {
		amountMode = $bindable('percent'),
		amount = $bindable(''),
		source = $bindable('tap'),
		volUnit,
		tankVolume,
		tankVolumeIsActual,
		error = null,
		compact = false,
		additives = [],
		recentProducts = [],
		errors = {}
	}: {
		amountMode?: string;
		amount?: string;
		source?: string;
		volUnit: string;
		tankVolume: number | null;
		tankVolumeIsActual: boolean;
		error?: string | null;
		compact?: boolean;
		/** What went in: conditioner / remineraliser rows (not shown `compact`) */
		additives?: { product: string; amount: string; unit: string }[];
		/** For the product datalist: added before, or dosed */
		recentProducts?: { product: string; amount: unknown; unit: unknown; at: string }[];
		/** `additive_<i>` from the server */
		errors?: Record<string, string>;
	} = $props();

	// Conditioner / remineraliser rows: start with what the entry has, add rows as needed
	let rows = $state(additives.map((a) => ({ ...a })));
	const addRow = () => (rows = [...rows, { product: '', amount: '', unit: 'mL' }]);
	const removeRow = (i: number) => (rows = rows.filter((_, j) => j !== i));
	function pickProduct(i: number) {
		const r = recentProducts.find((p) => p.product.toLowerCase() === rows[i].product.trim().toLowerCase());
		if (r && typeof r.unit === 'string' && r.unit) rows[i].unit = r.unit;
	}

	// % and volume convert into each other when the tank's volume is known (README § 11)
	function switchMode(mode: string) {
		const a = parseNumber(amount);
		if (a != null && tankVolume && mode !== amountMode) {
			amount = mode === 'percent' ? String(Math.round((a / tankVolume) * 100)) : formatNumber((tankVolume * a) / 100, 1);
		}
		amountMode = mode;
	}
	// "≈ 8.5 gal of 34 gal actual volume"
	const wcNote = $derived.by(() => {
		const a = parseNumber(amount);
		if (a == null || !tankVolume) return '';
		const of = `${formatNumber(tankVolume, 1)} ${volUnit}${tankVolumeIsActual ? ' actual volume' : ''}`;
		return amountMode === 'percent'
			? `≈ ${formatNumber((tankVolume * a) / 100, 1)} ${volUnit} of ${of}`
			: `≈ ${formatNumber((a / tankVolume) * 100, 0)}% of ${of}`;
	});
</script>

<div class="wcf" class:compact>
	<div class="field">
		<div class="amount-head">
			<label class="label" for="amount">Amount</label>
			<fieldset class="unit-toggle">
				<legend class="sr-only">Amount unit</legend>
				<label><input type="radio" name="amountMode" value="percent" checked={amountMode === 'percent'} onchange={() => switchMode('percent')} />%</label>
				<label><input type="radio" name="amountMode" value="volume" checked={amountMode === 'volume'} onchange={() => switchMode('volume')} />{volUnit}</label>
			</fieldset>
		</div>
		<div class="amount-box">
			<input
				id="amount"
				name="amount"
				inputmode="decimal"
				autocomplete="off"
				bind:value={amount}
				aria-invalid={!!error}
				aria-describedby={wcNote ? 'wc-note' : undefined}
			/>
			<span class="unit" aria-hidden="true">{amountMode === 'percent' ? '%' : volUnit}</span>
		</div>
		{#if wcNote}<span class="hint" id="wc-note">{wcNote}</span>{/if}
		{#if amountMode === 'percent'}
			<div class="presets">
				{#each ['10', '25', '50', '75'] as q (q)}
					<button type="button" class="chip" aria-pressed={amount === q} onclick={() => (amount = q)}>{q}%</button>
				{/each}
			</div>
		{/if}
		{#if error}<span class="error-text">✕ {error}</span>{/if}
	</div>
	<fieldset class="field">
		<legend class="label src">Source water <Tip text={TIPS.sourceWater} label="About source water" /></legend>
		<div class="options three">
			{#each WATER_SOURCES as s (s.value)}
				<label class="option"><input type="radio" name="source" value={s.value} bind:group={source} />{s.label}</label>
			{/each}
		</div>
	</fieldset>
	{#if !compact}
		<!-- what went in: optional, one row per product -->
		<fieldset class="field additives">
			<legend class="label">What went in · optional</legend>
			{#if rows.length}
				<datalist id="recent-additives">
					{#each recentProducts as r (r.product)}<option value={r.product}></option>{/each}
				</datalist>
				<div class="rows">
					{#each rows as row, i (i)}
						<div class="additive">
							<label class="sr-only" for="additive-product-{i}">Product</label>
							<input
								class="input"
								id="additive-product-{i}"
								name="additive_product"
								list="recent-additives"
								maxlength="80"
								autocomplete="off"
								placeholder="Conditioner or remineraliser"
								bind:value={row.product}
								onchange={() => pickProduct(i)}
								aria-invalid={!!errors[`additive_${i}`]}
							/>
							<label class="sr-only" for="additive-amount-{i}">Amount</label>
							<input class="input" id="additive-amount-{i}" name="additive_amount" inputmode="decimal" autocomplete="off" placeholder="Amount" bind:value={row.amount} />
							<label class="sr-only" for="additive-unit-{i}">Unit</label>
							<input class="input" id="additive-unit-{i}" name="additive_unit" list="additive-units" maxlength="20" autocomplete="off" placeholder="mL" bind:value={row.unit} />
							<button type="button" class="btn-icon" aria-label="Remove {row.product || 'this row'}" onclick={() => removeRow(i)}>✕</button>
							{#if errors[`additive_${i}`]}<span class="error-text">✕ {errors[`additive_${i}`]}</span>{/if}
						</div>
					{/each}
				</div>
				<datalist id="additive-units">
					{#each DOSING_UNITS as u (u)}<option value={u}></option>{/each}
					<option value="capfuls"></option>
				</datalist>
			{/if}
			<button type="button" class="btn-text add" onclick={addRow}>+ Add conditioner or remineraliser</button>
		</fieldset>
	{/if}
</div>

<style>
	.wcf {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.src {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	/* one big amount field, with % / gal switching the unit (and converting the value) */
	.amount-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.amount-head .label {
		font-size: 13px;
		color: var(--text-muted);
	}
	.unit-toggle {
		display: flex;
		border: 1px solid var(--divider);
	}
	.unit-toggle label {
		position: relative;
		min-width: 48px;
		padding: 5px 10px;
		text-align: center;
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
		cursor: pointer;
	}
	.unit-toggle label + label {
		border-left: 1px solid var(--divider);
	}
	/* 30px to match the design, 44px to tap */
	.unit-toggle label::after {
		content: '';
		position: absolute;
		inset: -7px 0;
	}
	.unit-toggle label:has(input:checked) {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.unit-toggle label:has(input:focus-visible) {
		outline: 2px solid var(--accent);
	}
	.unit-toggle input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
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
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.presets .chip {
		padding: 0 12px;
		font-size: 13px;
		font-weight: 700;
	}
	.three {
		grid-template-columns: repeat(3, 1fr);
	}

	/* what went in: product wide, amount and unit small, ✕ to take a row out */
	.additives .rows {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.additive {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 72px 44px;
		gap: 6px;
		align-items: center;
	}
	.additive .error-text {
		grid-column: 1 / -1;
	}
	.additive .btn-icon {
		width: 44px;
		height: 44px;
		color: var(--text-muted);
	}
	.additives .add {
		min-height: 44px;
		margin-top: 2px;
		padding: 0;
		font-size: 14px;
		font-weight: 800;
	}

	/* On the water test: the size of a reading, not the page's main field */
	.compact {
		gap: 16px;
	}
	.compact .amount-box {
		height: 44px;
		padding: 0 10px;
	}
	.compact .amount-box:focus-within {
		padding: 0 9px;
	}
	.compact .amount-box input {
		font-size: 18px;
	}
	.compact .amount-box .unit {
		font-size: 13px;
	}
	.compact .option {
		min-height: 44px;
	}

	@media (min-width: 1024px) {
		/* two readings wide: amount and source side by side */
		.compact {
			display: grid;
			grid-template-columns: 1fr 1fr;
			align-items: start;
			gap: 20px;
		}
		.compact .field {
			gap: 6px;
		}
	}
</style>
