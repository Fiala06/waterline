<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import Tip from '$lib/components/Tip.svelte';
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import CustomParamSheet from '$lib/components/CustomParamSheet.svelte';

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
		{#if data.fromReview}<input type="hidden" name="from" value="review" />{/if}
		<div class="rows">
			<!-- desktop: one table like D4 -->
			<div class="thead" aria-hidden="true"><span>Parameter</span><span>Min</span><span>Max</span><span>Unit</span><span>Track</span></div>
			{#each data.rows as r (r.id)}
				<div class="card prow" class:off={!tracked[r.id]}>
					<div class="p-head">
						<div class="p-name">
							<span class="nm-line"><span class="nm">{r.name}</span>{#if r.tip}<Tip text={r.tip} label="About {r.name}" />{/if}</span>
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

<CustomParamSheet bind:open={addOpen} tankName={data.tank.name} error={form?.custom?.error ?? null} reusable={data.reusable} />

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
	.nm-line {
		display: inline-flex;
		align-items: center;
		gap: 7px;
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
		border-radius: 0;
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
		border-radius: 0;
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
			border-radius: 0;
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
			border-radius: 0;
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
			border-radius: 0;
			font-size: 15px;
			padding: 0 22px;
		}
	}
</style>
