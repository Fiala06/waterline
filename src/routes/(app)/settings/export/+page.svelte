<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { HISTORY_IMPORTS, IMPORTS } from '$lib/imports';

	let { data, form } = $props();

	let scope = $state<'tank' | 'account'>(untrack(() => (data.exportTanks.length > 1 ? 'account' : 'tank')));
	let tankId = $state(untrack(() => data.defaultTank ?? ''));
	let format = $state<'zip' | 'csv'>('zip');

	const latest = $derived(data.exports[0]);
	const building = $derived(latest?.status === 'building' ? latest : null);
	const tankName = $derived(data.exportTanks.find((t) => t.id === tankId)?.name ?? null);
	// A finished file for what's picked now: Download takes the place of Build (G10, D10).
	const ready = $derived(
		latest?.status === 'ready' && latest.format === format && latest.scope === scope && (scope === 'account' || latest.tankName === tankName)
			? latest
			: null
	);
	const older = $derived(data.exports.filter((e) => e.id !== (building ?? ready)?.id));

	// Poll while a build is running.
	const buildingId = $derived(building?.id);
	let live = $state<{ progress: number; progressText: string | null } | null>(null);
	$effect(() => {
		if (!buildingId) {
			live = null;
			return;
		}
		const id = buildingId;
		const t = setInterval(async () => {
			try {
				const r = await fetch(`/settings/export/${id}`);
				if (!r.ok) return;
				const s = await r.json();
				live = s;
				if (s.status !== 'building') {
					clearInterval(t);
					invalidateAll();
				}
			} catch {
				/* offline for a moment: try again on the next tick */
			}
		}, 700);
		return () => clearInterval(t);
	});

	const est = $derived(data.estimates[scope === 'account' ? 'account' : tankId] ?? 0);
	// "48.2 MB" never splits across lines
	const size = (b: number | null) =>
		b == null ? '' : b < 1_000_000 ? `${Math.max(1, Math.round(b / 1000))}\u00a0KB` : `${(b / 1_000_000).toFixed(1)}\u00a0MB`;
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: data.user.timeZone });
	const label = (e: (typeof data.exports)[number]) =>
		`${e.format === 'zip' ? 'Full backup' : 'Water tests CSV'} · ${e.scope === 'account' ? 'whole account' : (e.tankName ?? 'tank')}`;
</script>

<svelte:head><title>Import & export · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>Import & export</h1>
		<p class="muted">Take everything with you. Nothing is deleted.</p>
	</div>

	{#if !data.exportTanks.length}
		<EmptyState icon="tank" title="No tanks yet" text="Add a tank to have something to export." href="/tanks/new" label="Add tank" primary />
	{:else}
		<form id="export-form" method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="stack">
			<fieldset class="field">
				<legend class="label">Scope</legend>
				<div class="segmented scope">
					<label><input type="radio" name="scope" value="tank" bind:group={scope} />One tank</label>
					<label>
						<input type="radio" name="scope" value="account" bind:group={scope} />Whole account
						{#if data.exportTanks.length > 1}<small>{data.exportTanks.length} tanks</small>{/if}
					</label>
				</div>
				{#if scope === 'tank'}
					<select class="input tank" name="tankId" bind:value={tankId} aria-label="Tank">
						{#each data.exportTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
					</select>
				{/if}
			</fieldset>

			<fieldset class="field">
				<legend class="label">Format</legend>
				<div class="formats">
					<label class="choice">
						<input class="radio" type="radio" name="format" value="zip" bind:group={format} />
						<span class="ctext"><strong>Full backup</strong><small>ZIP with JSON data and all photos{est ? ` · about\u00a0${size(est)}` : ''}</small></span>
					</label>
					<label class="choice">
						<input class="radio" type="radio" name="format" value="csv" bind:group={format} />
						<span class="ctext"><strong>Water tests (CSV)</strong><small>One row per test, for spreadsheets</small></span>
					</label>
					<!-- not a file to build: the tank's summary page, to copy from -->
					<a class="choice link" href="/tanks/{tankId}/summary">
						<span class="ctext"
							><strong>Summary for an AI assistant</strong><small
								>{scope === 'tank' && tankName ? `${tankName}'s` : "A tank's"} recent readings and care as text, to paste into a chat</small
							></span
						>
						<span class="chev" aria-hidden="true">›</span>
					</a>
				</div>
			</fieldset>
			{#if form?.error}<p class="error-text">✕ {form.error}</p>{/if}
		</form>

		{#if building}
			{@const pct = live?.progress ?? building.progress}
			<div class="card progress" role="status">
				<div class="row"><strong>Building {building.format === 'zip' ? 'backup' : 'CSV'}…</strong><span class="num muted">{pct}%</span></div>
				<div class="bar" aria-hidden="true"><i style:width="{pct}%"></i></div>
				<span class="muted sm">{live?.progressText ?? building.progressText ?? ''}</span>
			</div>
			<div class="action"><button class="btn btn-lg waiting" disabled>Download when ready</button></div>
		{:else if ready}
			<div class="done">
				<div class="ready" role="status">
					<div class="ready-text">
						<div class="ready-title"><span class="check" aria-hidden="true">✓</span> {ready.format === 'zip' ? 'Backup' : 'CSV'} ready</div>
						<div class="ready-meta">
							<span class="hide-phone">{ready.fileName}{' · '}</span>{size(ready.size)}{ready.summary ? ` · ${ready.summary}` : ''}
						</div>
						<div class="ready-note">Link expires in 24 hours</div>
					</div>
					<a class="btn btn-lg btn-ok" href="/settings/export/{ready.id}/download" download>Download {ready.format === 'zip' ? 'backup' : 'CSV'}</a>
				</div>
				<button class="btn-text again" form="export-form">Build again</button>
			</div>
		{:else}
			<div class="action">
				<button class="btn btn-primary btn-lg" form="export-form">{format === 'zip' ? 'Build backup' : 'Build CSV'}</button>
			</div>
		{/if}
	{/if}

	{#if data.exportTanks.length}
		<!-- one plain form: the tank, then the kind, on to its import (works without scripts) -->
		<section class="imports" aria-labelledby="imports-h">
			<h2 id="imports-h">Import from a spreadsheet</h2>
			<form method="GET" action="/import" class="card imp">
				<p class="muted sm">Past entries or a list from another app or spreadsheet, one kind at a time. Each has a template to fill in, and you see every row before anything is added.</p>
				{#if data.exportTanks.length > 1}
					<label class="into">
						<span class="label">Into</span>
						<select class="input" name="tank" value={data.defaultTank}>
							{#each data.exportTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
						</select>
					</label>
				{:else}
					<input type="hidden" name="tank" value={data.exportTanks[0].id} />
				{/if}
				<div class="kinds">
					<span class="k-head">History</span>
					<div class="k-list">
						{#each HISTORY_IMPORTS as k (k)}<button class="chip" name="kind" value={IMPORTS[k].slug}>{IMPORTS[k].label}</button>{/each}
					</div>
					<span class="k-head">The tank's lists</span>
					<div class="k-list">
						{#each ['livestock', 'plants', 'equipment'] as const as k (k)}<button class="chip" name="kind" value={IMPORTS[k].slug}>{IMPORTS[k].label}</button>{/each}
					</div>
				</div>
			</form>
		</section>
	{/if}

	{#if older.length}
		<section class="recent">
			<h2 class="label">Recent exports</h2>
			<ul class="card list">
				{#each older as e (e.id)}
					<li>
						<span>{label(e)}</span>
						<span class="meta">
							{day(e.createdAt)}{' · '}{#if e.status === 'ready'}<a href="/settings/export/{e.id}/download" download>Download</a
								>{:else if e.status === 'failed'}<span class="status-bad">✕ Failed</span>{:else}{e.status}{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	/* Import from a spreadsheet */
	.imports {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* a section of its own, under the page's title */
	.imports h2 {
		margin: 8px 0 0;
		font-size: 17px;
		font-weight: 600;
		color: var(--text);
	}
	.imp {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.imp p {
		margin: 0;
		line-height: 1.5;
	}
	.into {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.kinds {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.k-head {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.k-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.k-list + .k-head {
		margin-top: 4px;
	}
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 600px;
	}
	.head {
		display: flex;
		flex-direction: column;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 28px;
		font-weight: 600;
	}
	.head p {
		margin: 0;
		font-size: 14px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.segmented.scope label {
		min-height: 44px;
		font-size: 15px;
	}
	.formats {
		display: grid;
		gap: 8px;
	}
	/* format cards (17): ring radio, accent border when picked */
	.choice {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: var(--surface);
		cursor: pointer;
	}
	.choice:has(input:checked) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.choice:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ctext {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.link {
		align-items: center;
		color: var(--text);
	}
	.link .ctext {
		flex: 1;
	}
	.chev {
		font-size: 20px;
		color: var(--text-faint);
	}
	@media (hover: hover) {
		.link:hover {
			border-color: var(--border-strong);
		}
	}
	.ctext strong {
		font-size: 16px;
		font-weight: 600;
	}
	.ctext small,
	.sm {
		font-size: 13px;
		line-height: 1.4;
	}
	.ctext small {
		color: var(--text-muted);
	}

	.progress {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		background: var(--surface-2);
	}
	.row {
		display: flex;
		justify-content: space-between;
		font-size: 15px;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--border);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 4px;
		background: var(--accent);
		transition: width 0.3s;
	}

	/* ready (G10 on phones, D10 on desktop) */
	.ready {
		padding: 20px;
		border-radius: 18px;
		background: var(--ok-bg);
		border: 1px solid color-mix(in srgb, var(--ok) 22%, var(--ok-bg));
		color: var(--ok-text);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}
	.ready-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 14px;
		line-height: 1.5;
		text-wrap: pretty;
	}
	.ready-title {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		margin-bottom: 2px;
		font-size: 18px;
		font-weight: 700;
	}
	.check {
		width: 52px;
		height: 52px;
		border-radius: 26px;
		background: var(--ok);
		color: var(--on-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 26px;
	}
	/* 17: a quiet placeholder while the file builds */
	.btn.waiting:disabled {
		opacity: 1;
		background: var(--surface-hi);
		border-color: var(--surface-hi);
		color: var(--text-faint);
	}
	.btn-ok {
		background: var(--ok);
		border-color: var(--ok);
		color: var(--on-accent);
		font-weight: 700;
	}
	.btn-ok:hover {
		color: var(--on-accent);
	}
	@media (hover: hover) {
		.btn-ok:hover {
			background: color-mix(in srgb, var(--ok) 86%, var(--text));
			border-color: color-mix(in srgb, var(--ok) 86%, var(--text));
		}
	}
	.done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.done .ready {
		align-self: stretch;
	}

	.recent {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.recent h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 14px;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.meta {
		color: var(--text-muted);
	}
	.meta a {
		position: relative;
		font-weight: 600;
	}
	/* a 44px target without making the row taller */
	.meta a::after {
		content: '';
		position: absolute;
		inset: -12px -8px;
	}

	@media (min-width: 1024px) {
		.page {
			gap: 22px;
		}
		.segmented.scope,
		select.tank {
			max-width: 440px;
		}
		.formats {
			grid-template-columns: 1fr 1fr;
		}
		.action .btn {
			width: auto;
			height: 48px;
			padding: 0 22px;
			border-radius: 12px;
			font-size: 16px;
		}
		.done {
			align-items: flex-start;
		}
		.again {
			padding: 0;
		}
		.ready {
			flex-direction: row;
			align-items: center;
			text-align: left;
		}
		.ready-text {
			flex: 1;
			min-width: 0;
		}
		.ready-title {
			flex-direction: row;
			gap: 6px;
			margin: 0;
			font-size: 16px;
		}
		.check {
			width: auto;
			height: auto;
			background: none;
			color: inherit;
			font-size: inherit;
		}
		.ready-note {
			font-size: 13px;
		}
		.ready .btn {
			width: auto;
			height: 48px;
			padding: 0 22px;
			border-radius: 12px;
			font-size: 16px;
		}
		.list li {
			flex-direction: row;
			justify-content: space-between;
			gap: 16px;
		}
		.recent h2 {
			font-size: 13px;
		}
	}
</style>
