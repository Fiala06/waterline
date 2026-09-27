<script lang="ts">
	// 14 · Water change amount (% or volume, with presets) and source water.
	// The log event form uses it as is; the water test's "Also log a water
	// change" card uses it `compact`, sized like the readings around it.
	import { WATER_SOURCES } from '$lib/events';
	import { formatNumber, parseNumber } from '$lib/units';

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
				<label><input type="radio" name="amountMode" value="percent" bind:group={amountMode} />%</label>
				<label><input type="radio" name="amountMode" value="volume" bind:group={amountMode} />{volUnit}</label>
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
		<legend class="label">Source water</legend>
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
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}

	/* one big amount field (14) */
	.amount-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.amount-head .label {
		font-size: 14px;
		color: var(--text-muted);
	}
	.unit-toggle {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.unit-toggle label {
		position: relative;
		min-width: 44px;
		padding: 4px 10px;
		border-radius: 6px;
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		cursor: pointer;
	}
	/* 30px to match the design, 44px to tap */
	.unit-toggle label::after {
		content: '';
		position: absolute;
		inset: -7px 0;
	}
	.unit-toggle label:has(input:checked) {
		background: var(--border);
		color: var(--text);
		font-weight: 600;
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
		height: 64px;
		padding: 0 16px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.amount-box:focus-within {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.amount-box:has(input[aria-invalid='true']) {
		border-color: var(--bad);
	}
	.amount-box input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: 28px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.amount-box .unit {
		font-size: 17px;
		color: var(--text-muted);
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.presets .chip {
		padding: 0 12px;
		font-size: 13px;
	}
	.presets .chip[aria-pressed='true'] {
		color: var(--on-accent);
	}
	.three {
		grid-template-columns: repeat(3, 1fr);
	}
	/* 14: the choices are outlined; the picked one is filled */
	.option:not(:has(input:checked)) {
		background: transparent;
	}

	/* On the water test (05, 08): the size of a reading, not the page's main field */
	.compact {
		gap: 16px;
	}
	/* a well in the card around it */
	.compact .amount-box {
		height: 48px;
		padding: 0 12px;
		border-radius: 12px;
		background: var(--bg);
		border-color: var(--border-strong);
	}
	.compact .amount-box input {
		font-size: 20px;
	}
	.compact .amount-box .unit {
		font-size: 14px;
	}
	.compact .option {
		min-height: 44px;
	}

	@media (min-width: 1024px) {
		.amount-head .label {
			font-size: 13px;
		}
		legend {
			margin-bottom: 6px;
		}
		.amount-box {
			background: var(--surface-2);
			border-color: var(--border-strong);
		}
		/* 08 is two readings wide: amount and source side by side */
		.compact {
			display: grid;
			grid-template-columns: 1fr 1fr;
			align-items: start;
			gap: 20px;
		}
		.compact .field {
			gap: 6px;
		}
		.compact .field > .label {
			font-size: 13px;
		}
		.compact .amount-box input {
			font-size: 19px;
		}
		.compact .amount-box .unit {
			font-size: 13px;
		}
	}
</style>
