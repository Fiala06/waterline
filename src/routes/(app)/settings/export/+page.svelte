<script lang="ts">
	// Import & export (redesign README § 15): scope, format, a build with its
	// progress, then the download; and a spreadsheet in, one kind at a time.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { HISTORY_FILES, IMPORTS } from '$lib/imports';

	let { data, form } = $props();

	let scope = $state<'tank' | 'account'>(untrack(() => (data.exportTanks.length > 1 ? 'account' : 'tank')));
	let tankId = $state(untrack(() => data.defaultTank ?? ''));
	let format = $state<'zip' | 'csv'>('zip');

	const latest = $derived(data.exports[0]);
	const building = $derived(latest?.status === 'building' ? latest : null);
	const tankName = $derived(data.exportTanks.find((t) => t.id === tankId)?.name ?? null);
	// A finished file for what's picked now: Download takes the place of Build.
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
		b == null ? '' : b < 1_000_000 ? `${Math.max(1, Math.round(b / 1000))} KB` : `${(b / 1_000_000).toFixed(1)} MB`;
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: data.user.timeZone });
	const label = (e: (typeof data.exports)[number]) =>
		`${e.format === 'zip' ? 'Full backup' : 'Water tests CSV'} · ${e.scope === 'account' ? 'whole account' : (e.tankName ?? 'tank')}`;
</script>

<svelte:head><title>Import & export · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>Import & export</h1>
		<p class="lede">Take everything with you. Nothing is deleted.</p>
	</div>

	{#if !data.exportTanks.length}
		<EmptyState icon="tank" title="No tanks yet" text="Add a tank to have something to export." href="/tanks/new" label="Add tank" primary />
	{:else}
		<section class="block" aria-labelledby="export-h">
			<h2 class="kicker" id="export-h">Export</h2>
			<form id="export-form" method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="stack">
				<fieldset class="scope-row">
					<legend class="sr-only">Scope</legend>
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

				<fieldset>
					<legend class="sr-only">Format</legend>
					<div class="formats">
						<label class="choice">
							<input class="sr-only" type="radio" name="format" value="zip" bind:group={format} />
							<span class="ctext"><strong>Full backup</strong><small>ZIP with JSON data and all photos{est ? ` · about ${size(est)}` : ''}</small></span>
						</label>
						<label class="choice">
							<input class="sr-only" type="radio" name="format" value="csv" bind:group={format} />
							<span class="ctext"><strong>Water tests (CSV)</strong><small>One row per test, for spreadsheets</small></span>
						</label>
						<!-- not a file to build: the tank's summary page, to copy from -->
						<a class="choice link" href="/tanks/{tankId}/summary">
							<span class="ctext"
								><strong>Summary to share</strong><small
									>{scope === 'tank' && tankName ? `${tankName}'s` : "A tank's"} readings and care as text. Summary for an AI assistant, a forum post or your fish store.</small
								></span
							>
						</a>
					</div>
				</fieldset>
				{#if form?.error}<p class="error-text">✕ {form.error}</p>{/if}
			</form>

			{#if building}
				{@const pct = live?.progress ?? building.progress}
				<div class="progress" role="status">
					<div class="row"><strong>Building {building.format === 'zip' ? 'backup' : 'CSV'}…</strong><strong class="num">{pct}%</strong></div>
					<div class="bar" aria-hidden="true"><i style:width="{pct}%"></i></div>
					<span class="sm">{live?.progressText ?? building.progressText ?? ''}</span>
				</div>
			{:else if ready}
				<div class="ready" role="status">
					<div class="ready-text">
						<span class="ready-title">✓ {ready.format === 'zip' ? 'Backup' : 'CSV'} ready</span>
						<span class="ready-meta">{ready.fileName}{' · '}{size(ready.size)}{ready.summary ? ` · ${ready.summary}` : ''}</span>
						<span class="ready-note">Link expires in 24 hours</span>
					</div>
					<a class="btn btn-primary" href="/settings/export/{ready.id}/download" download>Download</a>
					<button class="btn-text again" form="export-form">Build again</button>
				</div>
			{:else}
				<div class="action">
					<button class="btn btn-primary build" form="export-form">{format === 'zip' ? 'Build backup' : 'Build CSV'}</button>
				</div>
			{/if}

			{#if older.length}
				<div class="recent">
					<h3 class="recent-h">Recent exports</h3>
					<ul class="list">
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
				</div>
			{/if}
		</section>

		<!-- one plain form: the tank, then the kind, on to its import (works without scripts) -->
		<section class="block imports" aria-labelledby="imports-h">
			<h2 class="kicker" id="imports-h">Import from a spreadsheet</h2>
			<form method="GET" action="/import" class="imp">
				<p class="lede">Past entries or a list from another app or spreadsheet, one kind at a time. Each has a template to fill in, and you see every row before anything is added.</p>
				{#if data.exportTanks.length > 1}
					<div class="field into">
						<label class="label" for="imp-tank">Into</label>
						<select class="input" id="imp-tank" name="tank" value={data.defaultTank}>
							{#each data.exportTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
						</select>
					</div>
				{:else}
					<input type="hidden" name="tank" value={data.exportTanks[0].id} />
				{/if}
				<div class="kinds">
					<span class="k-head">History</span>
					<div class="k-list">
						{#each HISTORY_FILES as k (k)}<button class="btn sm-btn" name="kind" value={IMPORTS[k].slug}>{IMPORTS[k].label}</button>{/each}
					</div>
					<span class="k-head">The tank's lists</span>
					<div class="k-list">
						{#each ['livestock', 'plants', 'equipment', 'expenses'] as const as k (k)}<button class="btn sm-btn" name="kind" value={IMPORTS[k].slug}>{IMPORTS[k].label}</button>{/each}
					</div>
				</div>
			</form>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 820px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		max-width: 620px;
	}
	/* a kicker over a 2px ink rule, then the block */
	.block {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 14px;
		border-top: 2px solid var(--ink);
	}
	.block h2 {
		margin: 0;
		font-weight: 400;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.scope-row {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.segmented.scope label {
		min-width: 120px;
		padding: 0 12px;
	}
	select.tank {
		width: 220px;
	}
	.formats {
		display: grid;
		gap: 10px;
	}
	/* format tiles: a 2px border, ink when picked */
	.choice {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px;
		border: 2px solid var(--divider);
		background: var(--bg);
		cursor: pointer;
		color: var(--text);
	}
	.choice:has(input:checked) {
		border-color: var(--ink);
	}
	.choice:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ctext {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ctext strong {
		font-size: 15px;
		font-weight: 800;
	}
	.ctext small,
	.sm {
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-2);
	}
	@media (hover: hover) {
		.choice:hover {
			border-color: var(--ink);
		}
	}

	.build {
		padding: 0 20px;
	}
	.progress {
		padding: 14px;
		background: var(--surface);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		font-size: 15px;
	}
	.bar {
		height: 8px;
		background: var(--neutral-300);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}
	/* ready: a 2px ink box with Download */
	.ready {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		padding: 14px 16px;
		border: 2px solid var(--ink);
	}
	.ready-text {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}
	.ready-title {
		font-size: 15px;
		font-weight: 800;
	}
	.ready-meta {
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.ready-note {
		font-size: 12px;
		color: var(--text-muted);
	}
	.recent {
		display: flex;
		flex-direction: column;
	}
	.recent-h {
		margin: 0;
		font-weight: 400;
		font-size: 12px;
		color: var(--text-muted);
		padding-bottom: 4px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--divider);
		font-size: 14px;
	}
	.meta {
		color: var(--text-muted);
		text-align: right;
	}
	.meta a {
		position: relative;
		font-weight: 800;
	}
	/* a 44px target without making the row taller */
	.meta a::after {
		content: '';
		position: absolute;
		inset: -12px -8px;
	}

	/* Import from a spreadsheet */
	.imp {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.into .input {
		max-width: 260px;
	}
	.kinds {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		gap: 10px 16px;
		align-items: start;
	}
	.k-head {
		font-size: 13px;
		font-weight: 700;
		padding-top: 6px;
	}
	.k-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.sm-btn {
		min-height: 36px;
		padding: 0 12px;
		font-size: 13px;
	}
	@media (max-width: 1023px) {
		.kinds {
			grid-template-columns: 1fr;
		}
		.k-head {
			padding-top: 0;
		}
		.ready .btn-primary {
			flex: 1;
		}
	}
	@media (min-width: 1024px) {
		h1 {
			font-size: 22px;
		}
		.formats {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.action .btn {
			padding: 0 20px;
		}
	}
</style>
