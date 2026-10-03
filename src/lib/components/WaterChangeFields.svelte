<script lang="ts">
	// 14 · Water change amount (% or volume, with presets) and source water.
	// The log event form uses it as is; the water test's "Also log a water
	// change" card uses it `compact`, sized like the readings around it.
	import { WATER_SOURCES } from '$lib/events';
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
		compact = false
	}: {
		amountMode?: string;
		amount?: string;
		source?: string;
		volUnit: string;
		tankVolume: number | null;
		tankVolumeIsActual: boolean;
		error?: string | null;
		compact?: boolean;
	} = $props();

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
