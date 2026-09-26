<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { paramStatus, statusMedium } from '$lib/status';
	import { parseNumber } from '$lib/units';

	let { data, form } = $props();
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);

	// Derived (not an effect) so the server-rendered page shows the saved switches.
	let tracked = $derived<Record<string, boolean>>(Object.fromEntries(data.rows.map((r) => [r.id, r.tracked])));

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
		const s = paramStatus(v, { min: lo, max: hi });
		return { v, st: statusMedium(s), level: s.level };
	});
</script>

<svelte:head><title>Parameters & targets · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top">
		<!-- on desktop the header has "Tanks › {tank} › Parameters & targets" -->
		<a class="back hide-desk" href="/tanks/{data.tank.id}">‹ {data.tank.name}</a>
		<h1 class="hide-desk">Parameters &amp; targets</h1>
		<div class="muted hide-desk">{data.tank.name} · {tankTypeLabel(data.tank.type)}</div>
		<p class="intro">
			Set your own range for each parameter. Readings outside it are flagged
			<span class="status-bad strong">✕ out of range</span>; readings within 10% of a limit show
			<span class="status-warn strong">▲ near limit</span>.
		</p>
	</div>

	<form method="POST" action="?/save" use:enhance={() => ({ update }) => update({ reset: false })}>
		<div class="rows">
			<!-- desktop: one table like D4 -->
			<div class="thead" aria-hidden="true"><span>Parameter</span><span>Min</span><span>Max</span><span>Unit</span><span>Track</span></div>
			{#each data.rows as r (r.id)}
				<div class="card prow" class:off={!tracked[r.id]}>
					<div class="p-head">
						<div class="p-name">
							<span class="nm">{r.name}</span>
							<span class="faint sm">{tracked[r.id] ? r.defaultText : 'Not tracked · hidden from tests'}</span>
						</div>
						<label class="switch" aria-label="Track {r.name}">
							<input
								type="checkbox"
								name="tracked_{r.id}"
								checked={tracked[r.id]}
								onchange={(e) => (tracked = { ...tracked, [r.id]: e.currentTarget.checked })}
							/>
							<span></span>
						</label>
					</div>
					<div class="range" hidden={!tracked[r.id]}>
						<label class="minmax lo">
							<span>Min</span>
							<input name="min_{r.id}" inputmode="decimal" defaultValue={r.min} aria-label="{r.name} minimum" />
						</label>
						<span class="dash" aria-hidden="true">–</span>
						<label class="minmax hi">
							<span>Max</span>
							<input name="max_{r.id}" inputmode="decimal" defaultValue={r.max} aria-label="{r.name} maximum" />
						</label>
						<span class="u">{r.unit || '—'}</span>
					</div>
					{#if errors[r.id]}<span class="error-text">✕ {errors[r.id]}</span>{/if}
					{#if r.isCustom}
						<button type="button" class="remove" popovertarget="confirm-rm-{r.id}">Remove {r.name}</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="foot">
			<button type="button" class="add" onclick={() => (addOpen = true)}>+ Add custom parameter</button>
			<button class="btn btn-primary btn-lg">Save targets</button>
			<button class="reset" formaction="?/reset" formnovalidate>Reset to {tankTypeLabel(data.tank.type)} defaults</button>
		</div>
	</form>
</div>

{#each data.rows.filter((r) => r.isCustom) as r (r.id)}
	<ConfirmDelete
		id="confirm-rm-{r.id}"
		trigger={false}
		title="Remove {r.name}?"
		body={r.readings
			? `Its ${r.readings} reading${r.readings === 1 ? '' : 's'} will be deleted from History. This can't be undone. To keep them, switch it off instead.`
			: 'It has no readings yet. This can\'t be undone.'}
		action="?/deleteCustom"
		fields={{ paramId: r.id }}
		label="Remove"
	/>
{/each}

<Sheet bind:open={addOpen} title="Custom parameter" width={480}>
	<form method="POST" action="?/addCustom" class="custom" use:enhance>
		{#if form?.custom?.error}<p class="banner banner-bad" role="alert">✕ {form.custom.error}</p>{/if}
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
		min-width: 0;
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
		align-self: stretch; /* the whole box is the tap target */
		min-width: 0;
		width: 100%;
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
	/* 52 × 32 like the design, 44px to tap */
	.p-head .switch input {
		inset: -6px -4px;
	}
	.remove {
		align-self: flex-start;
		font-size: 14px;
		color: var(--bad);
		min-height: 44px;
		margin: -4px 0;
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
	.thead {
		display: none;
	}
	/* Desktop (D4): one table, Parameter · Min · Max · Unit · Track */
	@media (min-width: 1024px) {
		.wrap {
			max-width: 840px;
			padding: 24px 32px;
		}
		.top {
			padding: 0;
		}
		.intro {
			margin: 0;
		}
		.rows {
			margin-top: 16px;
			padding: 0;
			gap: 0;
			border-radius: 16px;
			background: var(--surface);
			border: 1px solid var(--border);
			overflow: hidden;
		}
		.thead,
		.prow {
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 64px 56px;
			column-gap: 12px;
			align-items: center;
		}
		.thead {
			padding: 10px 18px;
			font-size: 12px;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-faint);
			border-bottom: 1px solid var(--border);
		}
		.prow {
			row-gap: 6px;
			padding: 8px 18px;
			border: none;
			border-radius: 0;
			background: none;
		}
		.prow + .prow {
			border-top: 1px solid var(--divider-soft);
		}
		.p-head,
		.range {
			display: contents;
		}
		.p-name {
			grid-column: 1;
			grid-row: 1;
		}
		.lo {
			grid-column: 2;
			grid-row: 1;
		}
		.hi {
			grid-column: 3;
			grid-row: 1;
		}
		.u {
			grid-column: 4;
			grid-row: 1;
			width: auto;
		}
		.p-head .switch {
			grid-column: 5;
			grid-row: 1;
		}
		/* the column headers say Min and Max */
		.dash,
		.minmax span {
			display: none;
		}
		.minmax {
			height: 40px;
			border-radius: 10px;
		}
		.minmax input {
			font-size: 15px;
			text-align: left;
		}
		.error-text,
		.remove {
			grid-column: 1 / -1;
			justify-self: start;
		}
		.foot {
			flex-direction: row;
			align-items: center;
			gap: 12px;
			padding-top: 16px;
		}
		.add {
			height: 44px;
			padding: 0 18px;
			margin-right: auto;
		}
		.reset {
			order: 1;
		}
		.foot .btn-lg {
			order: 2;
			width: auto;
			height: 44px;
			border-radius: 12px;
			font-size: 15px;
			padding: 0 22px;
		}
	}
</style>
