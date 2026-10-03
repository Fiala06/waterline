<script lang="ts">
	// AI assistant (#9): let an assistant like Claude read the tanks you pick,
	// over MCP or a JSON API: connected by signing in (steps per app), or with
	// an access token made here. Read-only; no AI
	// keys are stored and nothing is sent anywhere: the assistant asks.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { fmtWhen } from '$lib/time';
	let { data, form } = $props();

	const tz = $derived(data.user.timeZone);
	const created = $derived(form?.created ?? null);
	const createErr = $derived<Record<string, string>>(form?.create?.errors ?? {});
	// new tokens read every tank unless unticked; after a refused save, what was picked
	const createPicked = $derived(new Set<string>(form?.create?.tankIds ?? data.tanks.filter((t) => !t.archived).map((t) => t.id)));
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});

	let copied = $state('');
	async function copy(what: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 2000);
		} catch {
			/* clipboard blocked: the field can still be selected */
		}
	}
	const token = $derived(created?.token ?? '<your token>');
	// Claude Code signs in by itself (/mcp › Authenticate), so no token in it
	const claudeCode = $derived(`claude mcp add --transport http waterline ${data.mcpUrl}`);
	const curl = $derived(`curl -H "Authorization: Bearer ${token}" ${data.apiUrl}/tanks`);
	const tankList = (names: string[]) => (names.length ? names.join(', ') : 'No tanks');
</script>

<svelte:head><title>AI assistant · Settings · Waterline</title></svelte:head>

{#snippet tankChecks(prefix: string, picked: Set<string>, err: string | undefined)}
	<fieldset class="tanks" aria-describedby={err ? `${prefix}-tanks-e` : undefined}>
		<legend class="label">Tanks it can read</legend>
		{#each data.tanks as t (t.id)}
			<label class="check-row"><input type="checkbox" name="tank" value={t.id} checked={picked.has(t.id)} /><span>{t.name}{t.archived ? ' · archived' : ''}</span></label>
		{/each}
		{#if err}<span class="error-text" id="{prefix}-tanks-e">✕ {err}</span>{/if}
	</fieldset>
{/snippet}

{#snippet copyField(id: string, label: string, text: string, pre = false)}
	<div class="field">
		<div class="label-row copy-row">
			<span class="label">{label}</span>
			<button type="button" class="btn-text copy" onclick={() => copy(id, text)}>{copied === id ? '✓ Copied' : 'Copy'}<span class="sr-only"> {label}</span></button>
		</div>
		<!-- one tap selects it all, to copy without scripts too -->
		<code class="code mono" class:pre {id}>{text}</code>
	</div>
{/snippet}

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>AI assistant</h1>
		<p class="muted">
			Let an assistant like Claude or ChatGPT read your tanks, to answer questions about them. It can read readings, History, livestock and photos, but can't change
			anything. Waterline stores no AI keys and sends nothing: the assistant asks, after you sign in to connect it or with an access token you make here.
		</p>
	</div>

	{#if created}
		<section class="card made" aria-labelledby="made-h">
			<h2 id="made-h">✓ Access token for {created.name}</h2>
			<p class="warn-text status-warn">▲ Copy it now: it's shown only this once.</p>
			{@render copyField('made-token', 'Access token', created.token)}
			<p class="muted small">Paste it into your app or script, as below. Anyone with it can read the tanks you picked, so keep it like a password.</p>
		</section>
	{/if}

	<section aria-labelledby="list-h">
		<h2 id="list-h">Connected</h2>
		{#if data.tokens.length}
			<ul class="list">
				{#each data.tokens as t (t.id)}
					<li>
						<div class="item">
							<div class="t">
								<span class="name">{t.name}{#if !t.bySignIn}{' '}<span class="mono hint-code">…{t.hint}</span>{/if}</span>
								<span class="meta">Reads {tankList(t.tankNames)}</span>
								<span class="meta"
									>{t.bySignIn ? 'Connected by signing in' : 'Made'} {fmtWhen(t.createdAt, tz)} · {t.lastUsedAt ? `Last used ${fmtWhen(t.lastUsedAt, tz)}` : 'Not used yet'}</span
								>
							</div>
							<div class="acts">
								<a
									class="btn-text edit-link"
									href="?edit={t.id}"
									aria-expanded={editing === t.id}
									onclick={(e) => {
										e.preventDefault();
										editing = editing === t.id ? null : t.id;
									}}>Tanks<span class="sr-only"> {t.name} can read</span></a
								>
								<button type="button" class="btn revoke" popovertarget="revoke-{t.id}">Revoke<span class="sr-only"> {t.name}</span></button>
							</div>
						</div>
						{#if editing === t.id}
							<form
								method="POST"
								action="?/tanks"
								class="edit"
								use:enhance={() =>
									async ({ result, update }) => {
										if (result.type === 'redirect') editing = null;
										await update();
									}}
							>
								<input type="hidden" name="id" value={t.id} />
								{@render tankChecks(`e-${t.id}`, new Set(t.tankIds), form?.edit?.id === t.id ? editErr.tanks : undefined)}
								<div class="edit-acts">
									<a class="btn" href="/settings/assistant" onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
									<button class="btn btn-primary">Save</button>
								</div>
							</form>
						{/if}
						<ConfirmDelete
							id="revoke-{t.id}"
							trigger={false}
							title="Revoke {t.name}'s token?"
							body="It stops reading your tanks straight away. To connect it again, make a new token."
							action="?/revoke"
							label="Revoke"
							fields={{ id: t.id }}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="none">No assistant connected. Nothing can read your tanks until you connect one.</p>
		{/if}
	</section>

	<section class="card how" aria-labelledby="how-h">
		<h2 id="how-h">How to connect</h2>
		<p class="muted small">
			Waterline is an MCP server. Add it to your assistant with this address, then sign in to Waterline when it asks, pick the tanks and choose Allow. It shows up
			under Connected.
		</p>
		{@render copyField('how-url', 'Server address', data.mcpUrl)}
		<div class="apps">
			<details>
				<summary>claude.ai, Claude Desktop and mobile</summary>
				<ol>
					<li>On claude.ai, open Settings › Connectors and choose Add custom connector.</li>
					<li>Name it Waterline, paste the server address, and add it.</li>
					<li>Choose Connect, sign in to Waterline, pick the tanks and choose Allow.</li>
				</ol>
				<p class="muted small">It's then in the Claude Desktop and mobile apps too. On a Team or Enterprise plan, an owner may need to add it first.</p>
			</details>
			<details>
				<summary>ChatGPT</summary>
				<ol>
					<li>In ChatGPT's settings, turn on developer mode (under Apps or Connectors, then Advanced).</li>
					<li>Create a connector with the server address, signing in with OAuth.</li>
					<li>Sign in to Waterline, pick the tanks and choose Allow, then turn the connector on in a chat.</li>
				</ol>
			</details>
			<details>
				<summary>Claude Code</summary>
				<ol>
					<li>In a terminal, add Waterline:{@render copyField('how-code', 'Claude Code command', claudeCode)}</li>
					<li>In Claude Code, run <span class="mono">/mcp</span>, choose waterline and Authenticate. Your browser opens to sign in to Waterline.</li>
				</ol>
			</details>
			<details>
				<summary>Cursor, VS Code and other apps</summary>
				<ol>
					<li>Add an MCP server with the server address (type HTTP, or Streamable HTTP).</li>
					<li>Apps that can sign in open Waterline for you to allow it. For one that can't, make an access token below and send it as a header.</li>
				</ol>
			</details>
		</div>
		<p class="muted small">These apps rename their menus now and then: if a name differs, look for Connectors or MCP servers.</p>
	</section>

	<section class="card tokens" aria-labelledby="tok-h">
		<h2 id="tok-h">Or use an access token</h2>
		<p class="muted small">For scripts, the JSON API and apps that can't sign in. You copy it once, into the app.</p>
		{#if data.tanks.length}
			<form method="POST" action="?/create" class="add" id="add" use:enhance={() => async ({ update }) => update({ reset: false })}>
				<div class="field">
					<label class="label" for="a-name">Name</label>
					<input
						class="input"
						id="a-name"
						name="name"
						maxlength="60"
						autocomplete="off"
						placeholder="e.g. My script"
						value={form?.create?.name ?? ''}
						aria-invalid={!!createErr.name}
					/>
					{#if createErr.name}<span class="error-text">✕ {createErr.name}</span>{/if}
				</div>
				{@render tankChecks('a', createPicked, createErr.tanks)}
				<p class="muted small">Tanks you add later aren't shared until you tick them here.</p>
				<button class="btn btn-primary go">Create access token</button>
			</form>
		{/if}
		<p class="muted small">{created ? 'These have your new token in them.' : 'Put your token in place of <your token>.'}</p>
		{@render copyField('tok-header', 'MCP clients: send this header', `Authorization: Bearer ${token}`)}
		{@render copyField('tok-api', 'The JSON API', curl)}
		<p class="muted small">
			Also <span class="mono">/tanks/&lt;id&gt;/summary</span>, <span class="mono">readings</span>, <span class="mono">history</span>,
			<span class="mono">livestock</span>, <span class="mono">trends</span> and <span class="mono">photos</span>, and <span class="mono">/photos/&lt;id&gt;</span>.
		</p>
	</section>
</div>

<style>
	.page {
		padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 640px;
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
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.card {
		padding: 16px;
		border-radius: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.made {
		border-color: var(--accent);
	}
	.small {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
	}
	.warn-text {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-faint);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.list li + li {
		border-top: 1px solid var(--border);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 12px 12px 16px;
	}
	.t {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 16px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.hint-code {
		font-size: 13px;
		font-weight: 400;
		color: var(--text-faint);
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.acts {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.edit-link {
		color: var(--text-muted);
		font-weight: 600;
	}
	.revoke {
		min-height: 44px;
		padding: 0 14px;
		border-radius: 0;
		font-size: 14px;
		color: var(--bad);
		border-color: var(--bad-border);
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 4px 16px 16px;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.edit-acts .btn-primary {
		flex: 1;
	}
	.tanks {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tanks legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.card :global(.input) {
		background: var(--surface-2);
		border-color: var(--border-strong);
	}
	/* one app's steps, opened on tap (works without scripts) */
	.apps {
		border-top: 1px solid var(--border);
	}
	details {
		border-bottom: 1px solid var(--border);
	}
	summary {
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '';
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-right: 2px solid var(--text-muted);
		border-bottom: 2px solid var(--text-muted);
		transform: rotate(45deg) translate(-2px, -2px);
		transition: transform 0.15s;
	}
	details[open] summary::after {
		transform: rotate(-135deg) translate(-2px, -2px);
	}
	details ol {
		margin: 0 0 12px;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	details ol :global(.field) {
		margin-top: 8px;
	}
	details > p.small {
		margin: -4px 0 14px;
	}
	.tokens .add {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.copy-row {
		justify-content: space-between;
		align-items: center;
	}
	.code {
		display: block;
		padding: 12px 14px;
		border-radius: 0;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-all;
		user-select: all;
		-webkit-user-select: all;
	}
	/* JSON keeps its indents, and wraps between words */
	.code.pre {
		word-break: normal;
		overflow-wrap: anywhere;
	}
	.copy {
		font-weight: 600;
	}
	.go {
		min-height: 48px;
	}
	@media (hover: hover) {
		.edit-link:hover {
			color: var(--accent);
		}
		.revoke:hover {
			background: var(--bad-bg);
		}
	}
	@media (min-width: 1024px) {
		.go {
			align-self: flex-start;
			min-height: 44px;
			padding: 0 22px;
		}
		.edit-acts .btn-primary {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
