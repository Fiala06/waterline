<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let scope = $state<'tank' | 'account'>(untrack(() => (data.exportTanks.length > 1 ? 'account' : 'tank')));
	let tankId = $state(untrack(() => data.defaultTank ?? ''));
	let format = $state<'zip' | 'csv'>('zip');

	const latest = $derived(data.exports[0]);
	const current = $derived(latest && (latest.status === 'building' || latest.status === 'ready') ? latest : null);
	const older = $derived(data.exports.filter((e) => e.id !== current?.id));

	// Poll while a build is running.
	let live = $state<{ progress: number; progressText: string | null } | null>(null);
	$effect(() => {
		if (current?.status !== 'building') {
			live = null;
			return;
		}
		const id = current.id;
		const t = setInterval(async () => {
			const r = await fetch(`/settings/export/${id}`);
			if (!r.ok) return;
			const s = await r.json();
			live = s;
			if (s.status !== 'building') {
				clearInterval(t);
				invalidateAll();
			}
		}, 700);
		return () => clearInterval(t);
	});

	const est = $derived(data.estimates[scope === 'account' ? 'account' : tankId] ?? 0);
	const size = (b: number | null) => (b == null ? '' : b < 1_000_000 ? `${Math.max(1, Math.round(b / 1000))} KB` : `${(b / 1_000_000).toFixed(1)} MB`);
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: data.user.timeZone });
	const label = (e: (typeof data.exports)[number]) =>
		`${e.format === 'zip' ? 'Full backup' : 'Water tests CSV'} · ${e.scope === 'account' ? 'whole account' : (e.tankName ?? 'tank')}`;
</script>

<svelte:head><title>Export data · Waterline</title></svelte:head>

<div class="page sub-page">
	<a class="back sub-back" href="/settings">‹ Settings</a>
	<h1>Export data</h1>
	<p class="muted intro">Take everything with you. Nothing is deleted.</p>

	{#if !data.exportTanks.length}
		<div class="card box"><strong>No tanks yet</strong><span class="muted">Add a tank to have something to export.</span></div>
	{:else}
		<form method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="stack">
			<fieldset class="field">
				<legend class="label">Scope</legend>
				<div class="segmented">
					<label><input type="radio" name="scope" value="tank" bind:group={scope} />One tank</label>
					<label><input type="radio" name="scope" value="account" bind:group={scope} />Whole account{data.exportTanks.length > 1 ? ` (${data.exportTanks.length} tanks)` : ''}</label>
				</div>
				{#if scope === 'tank'}
					<select class="input" name="tankId" bind:value={tankId} aria-label="Tank">
						{#each data.exportTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
					</select>
				{/if}
			</fieldset>

			<fieldset class="field">
				<legend class="label">Format</legend>
				<label class="choice" class:on={format === 'zip'}>
					<input type="radio" name="format" value="zip" bind:group={format} />
					<span><strong>Full backup</strong><small>ZIP with JSON data and all photos{est ? ` · about ${size(est)}` : ''}</small></span>
				</label>
				<label class="choice" class:on={format === 'csv'}>
					<input type="radio" name="format" value="csv" bind:group={format} />
					<span><strong>Water tests (CSV)</strong><small>One row per test, for spreadsheets</small></span>
				</label>
			</fieldset>
			{#if form?.error}<p class="error-text">✕ {form.error}</p>{/if}
			<button class="btn btn-primary btn-lg" disabled={current?.status === 'building'}>
				{current?.status === 'building' ? 'Building…' : format === 'zip' ? 'Build backup' : 'Build CSV'}
			</button>
		</form>
	{/if}

	{#if current}
		{#if current.status === 'building'}
			{@const pct = live?.progress ?? current.progress}
			<div class="card box" role="status">
				<div class="row"><strong>Building {current.format === 'zip' ? 'backup' : 'CSV'}…</strong><span class="num">{pct}%</span></div>
				<div class="bar" aria-hidden="true"><i style:width="{pct}%"></i></div>
				<span class="muted sm">{live?.progressText ?? current.progressText ?? ''}</span>
			</div>
		{:else if current.status === 'ready'}
			<div class="card box ready" role="status">
				<div class="ok-title status-ok">✓ {current.format === 'zip' ? 'Backup' : 'CSV'} ready</div>
				<div class="muted sm">{current.fileName} · {size(current.size)} · {current.summary}</div>
				<div class="faint sm">Link expires in 24 hours</div>
				<a class="btn btn-primary" href="/settings/export/{current.id}/download" download>Download</a>
			</div>
		{/if}
	{/if}

	{#if older.length}
		<section class="stack">
			<h2 class="caps">Recent exports</h2>
			<ul class="card list">
				{#each older as e (e.id)}
					<li>
						<span>{label(e)}</span>
						<span class="muted sm">
							{day(e.createdAt)} ·
							{#if e.status === 'ready'}<a href="/settings/export/{e.id}/download" download>Download</a>{:else if e.status === 'failed'}<span class="status-bad">failed</span>{:else}{e.status}{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 600px;
	}
	.back {
		font-size: 16px;
		font-weight: 600;
		min-height: 36px;
		display: flex;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.intro {
		margin: -8px 0 0;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	.choice {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px;
		border-radius: 14px;
		border: 1px solid var(--border);
		background: var(--surface);
		cursor: pointer;
	}
	.choice.on {
		border-color: var(--accent);
	}
	.choice input {
		margin-top: 3px;
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
	}
	.choice span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.choice small,
	.sm {
		font-size: 13px;
	}
	.box {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row {
		display: flex;
		justify-content: space-between;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-hi);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}
	.ok-title {
		font-size: 17px;
		font-weight: 600;
	}
	.ready .btn {
		align-self: flex-start;
		margin-top: 4px;
	}
	.caps {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		font-weight: 600;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
