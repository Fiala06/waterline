<script lang="ts">
	// Server settings › Logs: what went wrong on this server (and, when turned
	// up, what it did), newest first; a reference from an error page finds its
	// entry. Works without scripts.
	import { enhance } from '$app/forms';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { toast } from '$lib/ui.svelte';
	let { data } = $props();

	// never color alone: a glyph and a word for each level
	const LEVELS = [
		{ key: 'error', label: 'Errors', one: '✕ Error', cls: 'status-bad' },
		{ key: 'warn', label: 'Warnings', one: '▲ Warning', cls: 'status-warn' },
		{ key: 'info', label: 'Info', one: 'ⓘ Info', cls: 'status-none' },
		{ key: 'debug', label: 'Debug', one: '⋯ Debug', cls: 'status-none' }
	] as const;
	const levelOf = (k: string) => LEVELS.find((l) => l.key === k) ?? LEVELS[2];
	const AREAS: Record<string, string> = {
		server: 'Server',
		request: 'Page',
		'sign-in': 'Sign-in',
		setup: 'Setup',
		email: 'Email',
		import: 'Import',
		export: 'Export',
		settings: 'Settings',
		update: 'Updates'
	};
	const DETAILS = [
		{ value: 'warn', label: 'Errors and warnings', d: 'What went wrong' },
		{ value: 'info', label: 'What the server does too', d: 'Sign-ins, emails sent, imports and changes to settings' },
		{ value: 'debug', label: 'Everything, for 24 hours', d: 'Every detail, while you track something down' }
	] as const;
	const all = $derived(data.counts.error + data.counts.warn + data.counts.info + data.counts.debug);
	const q = (patch: Record<string, string | null>) => {
		const u = new URLSearchParams();
		for (const [k, v] of Object.entries({ level: data.level, ...patch })) if (v) u.set(k, v);
		const s = u.toString();
		return `/settings/server/logs${s ? `?${s}` : ''}`;
	};
</script>

<svelte:head><title>Logs · Server settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings/server">‹ Server settings</a>
		<h1>Logs</h1>
		<p class="muted">What went wrong on this server, newest first. Entries are kept for {data.keepDays} days, and the container's log has them too.</p>
	</div>

	<form
		method="POST"
		action="?/detail"
		class="keep"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast('✓ Saved');
			}}
	>
		<fieldset>
			<legend class="label">What to keep</legend>
			<div class="group">
				{#each DETAILS as o (o.value)}
					<label class="row">
						<input type="radio" name="detail" value={o.value} defaultChecked={data.detail === o.value} />
						<span class="ttext"
							><span class="tt">{o.label}</span><span class="td">{o.value === 'debug' && data.debugUntil ? `On until ${data.debugUntil}` : o.d}</span></span
						>
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="actions"><button class="btn btn-primary">Save</button></div>
	</form>

	<div class="bar">
		<nav class="levels" aria-label="Level">
			<a class="chip" class:selected={!data.level && !data.ref} aria-current={!data.level && !data.ref ? 'page' : undefined} href="/settings/server/logs">All · {all}</a>
			{#each LEVELS as l (l.key)}
				{#if data.counts[l.key] || data.level === l.key}
					<a class="chip" class:selected={data.level === l.key} aria-current={data.level === l.key ? 'page' : undefined} href={q({ level: l.key, ref: null, before: null })}
						>{l.label} · {data.counts[l.key]}</a
					>
				{/if}
			{/each}
		</nav>
		<form method="GET" class="find" role="search">
			<label class="sr-only" for="log-ref">Reference from an error page</label>
			<input class="input mono" id="log-ref" name="ref" value={data.ref ?? ''} placeholder="Reference, e.g. 3f2a1b9c" autocomplete="off" spellcheck="false" />
			<button class="btn">Find</button>
		</form>
		<a class="btn download" href="/settings/server/logs/download{data.level ? `?level=${data.level}` : ''}" download>Download</a>
	</div>

	{#if data.entries.length}
		<ul class="entries">
			{#each data.entries as e (e.id)}
				{@const l = levelOf(e.level)}
				<li class="entry">
					<div class="e-top">
						<span class="lvl {l.cls}">{l.one}</span>
						<span class="area">{AREAS[e.area] ?? e.area}</span>
						<span class="when">{e.when}</span>
					</div>
					<p class="msg">{e.message}</p>
					{#if e.email || e.ref}
						<p class="meta">{e.email ?? ''}{e.email && e.ref ? ' · ' : ''}{#if e.ref}ref <span class="mono">{e.ref}</span>{/if}</p>
					{/if}
					{#if e.details}
						<details>
							<summary>Details</summary>
							<pre class="mono">{e.details}</pre>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
		{#if data.more && data.oldest}<a class="btn older" href={q({ ref: data.ref, before: String(data.oldest) })}>Older entries</a>{/if}
	{:else}
		<EmptyState
			compact
			icon="note"
			title={data.ref ? 'No entry with that reference' : 'Nothing logged'}
			text={data.ref
				? 'Check the reference on the error page, or look through All.'
				: data.detail === 'warn'
					? "No errors or warnings. Keep what the server does too, to see what it's been up to."
					: 'Nothing yet.'}
		/>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 760px;
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
		line-height: 1.5;
	}

	/* what to keep */
	.keep {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.group {
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 10px 16px;
		cursor: pointer;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.row input {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		accent-color: var(--accent);
	}
	.ttext {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tt {
		font-size: 15px;
	}
	.td {
		font-size: 12px;
		color: var(--text-faint);
	}
	.actions {
		display: flex;
	}

	/* filters, a reference, the download */
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.levels {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.find {
		display: flex;
		gap: 8px;
		flex: 1;
		min-width: 240px;
	}
	.find .input {
		height: 44px;
		font-size: 14px;
	}

	/* the entries */
	.entries {
		list-style: none;
		margin: 0;
		padding: 0 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.entry {
		padding: 12px 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.entry + .entry {
		border-top: 1px solid var(--divider-soft);
	}
	.e-top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		font-size: 12px;
	}
	.lvl {
		font-weight: 700;
	}
	.area {
		color: var(--text-muted);
		font-weight: 600;
	}
	.when {
		margin-left: auto;
		color: var(--text-faint);
		white-space: nowrap;
	}
	.msg {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	details summary {
		font-size: 12px;
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	pre {
		margin: 4px 0 0;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 320px;
		overflow: auto;
	}
	.older {
		align-self: flex-start;
	}
	@media (min-width: 1024px) {
		.entries,
		.group {
			background: var(--surface-2);
		}
	}
</style>
