<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '$lib/components/Sheet.svelte';
	import { paramStatus, statusMedium } from '$lib/status';
	import { parseNumber } from '$lib/units';

	let { data, form } = $props();
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);

	let tracked = $state<Record<string, boolean>>({});
	$effect(() => {
		tracked = Object.fromEntries(data.rows.map((r) => [r.id, r.tracked]));
	});

	// G7 · custom parameter sheet
	let addOpen = $state(false);
	$effect(() => {
		if (form?.custom) addOpen = true;
	});
	const units = ['ppm', 'mg/L', 'dKH', 'µS/cm', 'ppt'];
	let cName = $state('');
	let cUnit = $state('ppm');
	let cCustomUnit = $state('');
	let cMin = $state('');
	let cMax = $state('');
	let cDecimals = $state('2');
	const previewUnit = $derived(cUnit === 'custom' ? cCustomUnit : cUnit);
	const preview = $derived.by(() => {
		const lo = parseNumber(cMin);
		const hi = parseNumber(cMax);
		const mid = lo != null && hi != null ? (lo + hi) / 2 : (lo ?? hi);
		if (mid == null) return null;
		const d = Number(cDecimals);
		const v = Math.round(mid * 10 ** d) / 10 ** d;
		return { v, st: statusMedium(paramStatus(v, { min: lo, max: hi })) };
	});
</script>

<svelte:head><title>Parameters & targets · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top">
		<a class="back" href="/tanks/{data.tank.id}">‹ {data.tank.name}</a>
		<h1>Parameters &amp; targets</h1>
		<div class="muted">{data.tank.name} · {cap(data.tank.type)}</div>
		<p class="intro">
			Set your own range for each parameter. Readings outside it are flagged
			<span class="status-bad strong">✕ out of range</span>; readings within 10% of a limit show
			<span class="status-warn strong">▲ near limit</span>.
		</p>
	</div>

	<form method="POST" action="?/save" use:enhance={() => ({ update }) => update({ reset: false })}>
		<div class="rows">
			{#each data.rows as r (r.id)}
				<div class="card prow" class:off={!tracked[r.id]}>
					<div class="p-head">
						<div class="p-name">
							<span class="nm">{r.name}</span>
							<span class="faint sm">{tracked[r.id] ? r.defaultText : 'Not tracked · hidden from tests'}</span>
						</div>
						<label class="switch" aria-label="Track {r.name}">
							<input type="checkbox" name="tracked_{r.id}" bind:checked={tracked[r.id]} />
							<span></span>
						</label>
					</div>
					<div class="range" hidden={!tracked[r.id]}>
						<label class="minmax">
							<span>Min</span>
							<input name="min_{r.id}" inputmode="decimal" value={r.min} aria-label="{r.name} minimum" />
						</label>
						<span class="dash" aria-hidden="true">–</span>
						<label class="minmax">
							<span>Max</span>
							<input name="max_{r.id}" inputmode="decimal" value={r.max} aria-label="{r.name} maximum" />
						</label>
						<span class="u">{r.unit || '—'}</span>
					</div>
					{#if errors[r.id]}<span class="error-text">✕ {errors[r.id]}</span>{/if}
					{#if r.isCustom}
						<button class="remove" formaction="?/deleteCustom" name="paramId" value={r.id}>Remove {r.name}</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="foot">
			<button type="button" class="add" onclick={() => (addOpen = true)}>+ Add custom parameter</button>
			<button class="btn btn-primary btn-lg">Save targets</button>
			<button class="reset" formaction="?/reset" formnovalidate>Reset to {cap(data.tank.type)} defaults</button>
		</div>
	</form>
</div>

<Sheet bind:open={addOpen} title="Custom parameter" width={480}>
	<form method="POST" action="?/addCustom" class="custom" use:enhance>
		{#if form?.custom?.error}<p class="banner banner-bad" role="alert">✕ {form.custom.error}</p>{/if}
		<div class="field">
			<label class="label" for="c-name">Name</label>
			<input class="input" id="c-name" name="name" bind:value={cName} required maxlength="40" placeholder="e.g. Iron (Fe)" />
		</div>
		<fieldset class="field">
			<legend class="label">Unit</legend>
			<div class="unit-chips">
				{#each units as u (u)}
					<label class="option sm-opt"><input type="radio" name="unit" value={u} bind:group={cUnit} />{u}</label>
				{/each}
				<label class="option sm-opt"><input type="radio" name="unit" value="custom" bind:group={cUnit} />Custom</label>
			</div>
			{#if cUnit === 'custom'}
				<input class="input" name="customUnit" bind:value={cCustomUnit} maxlength="12" placeholder="Unit label" aria-label="Custom unit" />
			{/if}
		</fieldset>
		<div class="c-range">
			<label class="field"><span class="label">Min</span><input class="input" name="min" inputmode="decimal" bind:value={cMin} /></label>
			<label class="field"><span class="label">Max</span><input class="input" name="max" inputmode="decimal" bind:value={cMax} /></label>
			<label class="field"
				><span class="label">Decimals</span>
				<select class="input" name="decimals" bind:value={cDecimals}>
					<option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
				</select>
			</label>
		</div>
		{#if cName && preview}
			<div class="card preview">
				<span class="muted sm">Preview</span>
				<span><strong>{cName}</strong> <span class="num">{preview.v}</span> {previewUnit}</span>
				<span class="status-ok strong sm">{preview.st}</span>
			</div>
		{/if}
		<button class="btn btn-primary btn-lg">Add to {data.tank.name}</button>
	</form>
</Sheet>

<style>
	.wrap {
		max-width: 640px;
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
	}
	.top {
		padding: 8px 0 4px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.back {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-size: 15px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.intro {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.strong {
		font-weight: 600;
	}
	.sm {
		font-size: 12px;
	}
	.rows {
		padding-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.prow {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.prow.off {
		opacity: 0.6;
	}
	.p-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.p-name {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nm {
		font-size: 16px;
		font-weight: 600;
	}
	.range {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.range[hidden] {
		display: none;
	}
	.minmax {
		flex: 1;
		height: 48px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.minmax:focus-within {
		border-color: var(--accent);
	}
	.minmax input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		font-size: 18px;
		font-weight: 600;
		text-align: right;
		outline: none;
		font-variant-numeric: tabular-nums;
	}
	.dash {
		color: var(--placeholder);
	}
	.u {
		width: 40px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.remove {
		align-self: flex-start;
		font-size: 14px;
		color: var(--bad);
		min-height: 36px;
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 10px;
	}
	.add {
		height: 52px;
		border-radius: 14px;
		border: 1px dashed var(--border-strong);
		font-size: 15px;
		font-weight: 600;
		color: var(--accent);
	}
	.reset {
		font-size: 14px;
		color: var(--text-muted);
		padding: 8px;
		min-height: 44px;
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
	.unit-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.sm-opt {
		min-height: 44px;
		padding: 0 14px;
	}
	.c-range {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
	}
	.preview {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: var(--surface-2);
	}
</style>
