<script lang="ts">
	// G7 · Add a custom parameter to a tank. On the targets page, and in the
	// water test form ("+ Add parameter"), where `onadded` keeps the test in
	// progress on screen instead of following the action back to the targets page.
	import { applyAction, enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Sheet from './Sheet.svelte';
	import { paramStatus, statusMedium } from '$lib/status';
	import { parseNumber } from '$lib/units';

	let {
		open = $bindable(false),
		tankName,
		action = '?/addCustom',
		error = null,
		reusable = [],
		onadded
	}: {
		open?: boolean;
		tankName: string;
		/** The targets page's addCustom action */
		action?: string;
		/** The action's error after a post without JavaScript */
		error?: string | null;
		/** Stay on this page: called once the parameter is added */
		onadded?: () => void | Promise<void>;
		/** custom parameters from the keeper's other tanks, to add again in one tap */
		reusable?: { name: string; unit: string; min: number | null; max: number | null; decimals: number; tank: string }[];
	} = $props();
	/** "5–20 ppm", "above 30", "any" */
	const range = (r: { unit: string; min: number | null; max: number | null }) => {
		const u = r.unit ? ` ${r.unit}` : '';
		return r.min != null && r.max != null ? `${r.min}–${r.max}${u}` : r.min != null ? `above ${r.min}${u}` : r.max != null ? `below ${r.max}${u}` : r.unit;
	};

	const units = ['ppm', 'mg/L', 'dKH', 'µS/cm', 'ppt'];
	let cName = $state('');
	let cUnit = $state('ppm');
	let cCustomUnit = $state('');
	let cMin = $state('');
	let cMax = $state('');
	let cDecimals = $state('2');
	let failed = $state<string | null>(null);
	const shown = $derived(failed ?? error);

	const previewUnit = $derived(cUnit === 'custom' ? cCustomUnit : cUnit);
	const preview = $derived.by(() => {
		const lo = parseNumber(cMin);
		const hi = parseNumber(cMax);
		const mid = lo != null && hi != null ? (lo + hi) / 2 : (lo ?? hi);
		if (mid == null) return null;
		const d = Number(cDecimals);
		const v = Math.round(mid * 10 ** d) / 10 ** d;
		const s = paramStatus(v, { min: lo, max: hi });
		return { v, st: statusMedium(s), level: s.level };
	});

	function reset() {
		cName = cCustomUnit = cMin = cMax = '';
		cUnit = 'ppm';
		cDecimals = '2';
		failed = null;
	}

	const submit: SubmitFunction = () => async ({ result, update }) => {
		const added = result.type === 'redirect' || result.type === 'success';
		if (!onadded) {
			await update();
			if (added) reset();
		} else if (result.type === 'failure') {
			failed = (result.data?.custom as { error?: string } | undefined)?.error ?? "Couldn't add it. Try again.";
		} else if (added) {
			open = false;
			reset();
			await onadded();
		} else {
			await applyAction(result);
		}
	};
</script>

<Sheet bind:open title="Custom parameter" width={480}>
	{#if reusable.length}
		<section class="reuse" aria-labelledby="reuse-h">
			<h3 id="reuse-h">From your other tanks</h3>
			<ul>
				{#each reusable as r (r.name)}
					<li>
						<form method="POST" {action} use:enhance={submit}>
							<input type="hidden" name="name" value={r.name} />
							<input type="hidden" name="unit" value="custom" />
							<input type="hidden" name="customUnit" value={r.unit} />
							<input type="hidden" name="min" value={r.min ?? ''} />
							<input type="hidden" name="max" value={r.max ?? ''} />
							<input type="hidden" name="decimals" value={r.decimals} />
							<button class="reuse-row" aria-label="Add {r.name} to {tankName}">
								<span class="rt"><strong>{r.name}</strong><span class="muted">{[range(r), r.tank].filter(Boolean).join(' · ')}</span></span>
								<span class="add" aria-hidden="true">+ Add</span>
							</button>
						</form>
					</li>
				{/each}
			</ul>
			<p class="or">Or make a new one</p>
		</section>
	{/if}
	<form method="POST" {action} class="custom" use:enhance={submit}>
		{#if shown}<p class="banner banner-bad" role="alert">✕ {shown}</p>{/if}
		<div class="field">
			<label class="label" for="c-name">Name</label>
			<input class="input" id="c-name" name="name" bind:value={cName} required maxlength="40" placeholder="e.g. Iron (Fe)" />
		</div>
		<fieldset class="field">
			<legend class="label">Unit</legend>
			<div class="chips units">
				{#each units as u (u)}
					<label class="chip"><input type="radio" name="unit" value={u} bind:group={cUnit} />{u}</label>
				{/each}
				<label class="chip"><input type="radio" name="unit" value="custom" bind:group={cUnit} />Custom</label>
			</div>
			{#if cUnit === 'custom'}
				<input class="input" name="customUnit" bind:value={cCustomUnit} maxlength="12" placeholder="Unit label" aria-label="Custom unit" />
			{/if}
		</fieldset>
		<div class="c-range">
			<label class="field"><span class="label">Min</span><input class="input num" name="min" inputmode="decimal" bind:value={cMin} /></label>
			<label class="field"><span class="label">Max</span><input class="input num" name="max" inputmode="decimal" bind:value={cMax} /></label>
			<label class="field"
				><span class="label">Decimals</span>
				<select class="input num" name="decimals" bind:value={cDecimals}>
					<option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
				</select>
			</label>
		</div>
		{#if cName && preview}
			<div class="preview">
				<div class="pv">
					<span class="muted sm">Preview</span>
					<span class="pv-line"><strong>{cName}</strong> <span class="muted"><span class="num">{preview.v}</span> {previewUnit}</span></span>
				</div>
				<span class="status-{preview.level} strong">{preview.st}</span>
			</div>
		{/if}
		<button class="btn btn-primary btn-lg">Add to {tankName}</button>
	</form>
</Sheet>

<style>
	.reuse {
		margin-bottom: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.reuse h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.reuse ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.reuse li + li {
		border-top: 1px solid var(--border);
	}
	.reuse-row {
		width: 100%;
		min-height: 52px;
		padding: 8px 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		text-align: left;
		color: var(--text);
	}
	.rt {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		font-size: 15px;
	}
	.rt .muted {
		font-size: 13px;
	}
	.add {
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--accent);
	}
	.or {
		margin: 8px 0 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.custom {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.strong {
		font-weight: 600;
	}
	.sm {
		font-size: 12px;
	}
	/* G7: the chosen unit is ticked, like the other pick-from-a-list chips */
	.units label.chip:has(input:checked) {
		background: var(--selected);
		border-color: var(--accent);
		color: var(--text);
		font-weight: 600;
	}
	.units label.chip:has(input:checked)::before {
		content: '✓';
		color: var(--accent);
		font-weight: 700;
	}
	.c-range {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}
	/* G7: recessed fields in the sheet; background-color keeps the select's ▾ */
	.custom .input {
		background-color: var(--surface-2);
		border-color: var(--border-strong);
	}
	.custom .input:focus {
		border-color: var(--accent);
	}
	.c-range .input {
		padding: 0 12px;
		font-weight: 600;
	}
	.c-range select.input {
		padding-right: 32px;
		background-position:
			calc(100% - 17px) 52%,
			calc(100% - 12px) 52%;
	}
	.preview {
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
	}
	.pv {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.pv-line {
		font-size: 15px;
	}
	.pv-line .muted {
		font-weight: 400;
	}
</style>
