<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import Tip from '$lib/components/Tip.svelte';
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import CustomParamSheet from '$lib/components/CustomParamSheet.svelte';
	import { TEST_CADENCES } from '$lib/status';

	let { data, form } = $props();
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);

	// Derived (not an effect) so the server-rendered page shows the saved switches.
	let tracked = $derived<Record<string, boolean>>(Object.fromEntries(data.rows.map((r) => [r.id, r.tracked])));

	// G7 · custom parameter sheet
	let addOpen = $state(false);
	$effect(() => {
		if (form?.custom) addOpen = true;
	});
</script>

<svelte:head><title>Parameters & targets · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top">
		<!-- on desktop the header has "Tanks › {tank} › Parameters & targets" -->
		<a class="back hide-desk" href={data.returnTo ?? `/tanks/${data.tank.id}`}>‹ {data.returnTo ? 'Back to the water test' : data.tank.name}</a>
		<h1 class="hide-desk">Parameters &amp; targets</h1>
		<div class="muted hide-desk">{data.tank.name} · {tankTypeLabel(data.tank.type)}</div>
		<p class="intro">
			Set your own range for each parameter. Readings outside it show
			<span class="status-bad strong">✕ out of range</span>; readings within 10% of a limit show
			<span class="status-warn strong">▲ near limit</span>. Untracked parameters are hidden from tests and charts. Test every says how often to test one: a reading older than that is due on the dashboard.
		</p>
	</div>

	<form method="POST" action="?/save" use:enhance={() => ({ update }) => update({ reset: false })}>
		{#if data.fromReview}<input type="hidden" name="from" value="review" />{:else if data.returnTo}<input type="hidden" name="from" value={data.returnTo} />{/if}
		<div class="rows">
			<!-- desktop: one table like D4 -->
			<div class="thead" aria-hidden="true"><span>Parameter</span><span>Min</span><span>Max</span><span>Unit</span><span>Test every</span><span>Track</span></div>
			{#each data.rows as r (r.id)}
				<div class="prow" class:off={!tracked[r.id]}>
					<div class="p-head">
						<div class="p-name">
							<span class="nm-line"><span class="nm">{r.name}</span>{#if r.tip}<Tip text={r.tip} when={r.when?.text} label="About {r.name}" />{/if}</span>
							<span class="faint sm">{tracked[r.id] ? `${r.defaultText}${r.when?.optional ? ' · Optional' : ''}` : 'Not tracked · hidden from tests'}</span>
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
						<label class="every">
							<span>Test every</span>
							<select name="testEvery_{r.id}" aria-label="Test {r.name} every" value={r.testEvery}>
								{#each TEST_CADENCES as c (c.days ?? '')}<option value={c.days == null ? '' : String(c.days)}>{c.label}</option>{/each}
							</select>
						</label>
					</div>
					{#if errors[r.id]}<span class="error-text">✕ {errors[r.id]}</span>{/if}
					{#if r.isCustom}
						<button type="button" class="remove" popovertarget="confirm-rm-{r.id}">Remove {r.name}</button>
					{/if}
				</div>
			{/each}
		</div>

		<div class="foot">
			<button type="button" class="btn add" onclick={() => (addOpen = true)}>+ Add custom parameter</button>
			<button class="btn btn-primary save">Save targets</button>
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

<CustomParamSheet bind:open={addOpen} tankName={data.tank.name} error={form?.custom?.error ?? null} reusable={data.reusable} />

<style>
	.wrap {
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
	}
	.nm-line {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.intro {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 620px;
	}
	.strong {
		font-weight: 800;
	}
	.sm {
		font-size: 12px;
	}
	.rows {
		margin-top: 14px;
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
	}
	.prow {
		padding: 10px 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-bottom: 1px solid var(--divider);
	}
	.prow.off .p-name,
	.prow.off .range {
		opacity: 0.55;
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
	}
	.nm {
		font-size: 15px;
		font-weight: 600;
	}
	.range {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	/* "Test every": on phones its own line under the range */
	.every {
		flex-basis: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.every select {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		background: var(--surface);
		border: 1px solid var(--divider);
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
	}
	.every select:focus {
		outline: none;
		border-color: var(--accent);
	}
	.range[hidden] {
		display: none;
	}
	.minmax {
		flex: 1;
		min-width: 0;
		height: 44px;
		background: var(--surface);
		border: 1px solid var(--divider);
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
		font-size: 16px;
		font-weight: 600;
		text-align: right;
		outline: none;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.dash {
		color: var(--placeholder);
	}
	.u {
		width: 40px;
		font-size: 13px;
		color: var(--text-muted);
	}
	/* 44px to tap */
	.p-head .switch input {
		inset: -10px -4px;
	}
	.remove {
		align-self: flex-start;
		font-size: 14px;
		font-weight: 800;
		color: var(--bad);
		min-height: 44px;
		margin: -4px 0;
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 14px;
	}
	.add {
		border-style: dashed;
	}
	.reset {
		font-size: 14px;
		font-weight: 800;
		color: var(--text-muted);
		padding: 8px;
		min-height: 44px;
	}
	.thead {
		display: none;
	}
	/* Desktop: one table, Parameter · Min · Max · Unit · Track, beside the shell's Setup nav */
	@media (min-width: 1024px) {
		.wrap {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.top {
			padding: 0;
		}
		.intro {
			margin: 0;
		}
		.rows {
			border-top: none;
		}
		.thead,
		.prow {
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 64px 120px 56px;
			column-gap: 12px;
			align-items: center;
		}
		.thead {
			padding: 8px 0;
			border-bottom: 2px solid var(--ink);
			font-size: 11px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-muted);
		}
		.prow {
			row-gap: 6px;
			padding: 6px 0;
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
		.every {
			grid-column: 5;
			grid-row: 1;
			flex-basis: auto;
		}
		.every span {
			display: none;
		}
		.every select {
			width: 100%;
			font-size: 14px;
		}
		.p-head .switch {
			grid-column: 6;
			grid-row: 1;
		}
		/* the column headers say Min and Max */
		.dash,
		.minmax span {
			display: none;
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
			padding-top: 14px;
		}
		.add {
			margin-right: auto;
		}
		.reset {
			order: 1;
		}
		.save {
			order: 2;
		}
	}
</style>
