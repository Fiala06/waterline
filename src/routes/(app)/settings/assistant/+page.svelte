<script lang="ts">
	// AI assistant (#9, redesign README § 15): let an assistant like Claude read
	// the tanks you pick, over MCP or a JSON API: connected by signing in (steps
	// per app), or with an access token made here. Read-only; no AI keys are
	// stored and nothing is sent anywhere: the assistant asks.
	import { enhance } from '$app/forms';
	import { keepValues } from '$lib/forms';
	import { untrack } from 'svelte';
	import CopyField from '$lib/components/CopyField.svelte';
	import TankChecks from '$lib/components/TankChecks.svelte';
	import TokenList from '$lib/components/TokenList.svelte';
	import { fmtWhen } from '$lib/time';
	let { data, form } = $props();

	const tz = $derived(data.user.timeZone);
	const created = $derived(form?.created ?? null);
	const createErr = $derived<Record<string, string>>(form?.create?.errors ?? {});
	// new tokens read every tank unless unticked; after a refused save, what was picked
	const createPicked = $derived(new Set<string>(form?.create?.tankIds ?? data.tanks.filter((t) => !t.archived).map((t) => t.id)));
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});

	const token = $derived(created?.token ?? '<your token>');
	// Claude Code signs in by itself (/mcp › Authenticate), so no token in it
	const claudeCode = $derived(`claude mcp add --transport http waterline ${data.mcpUrl}`);
	const curl = $derived(`curl -H "Authorization: Bearer ${token}" ${data.apiUrl}/tanks`);
</script>

<svelte:head><title>AI assistant · Settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>AI assistant</h1>
		<p class="lede">
			Let an assistant like Claude or ChatGPT read your tanks, to answer questions about them. It can read readings, History, livestock and photos, but can't change
			anything. Waterline stores no AI keys and sends nothing: the assistant asks, after you sign in to connect it or with an access token you make here.
		</p>
	</div>

	{#if created}
		<section class="made" aria-labelledby="made-h">
			<h2 id="made-h">✓ Access token for {created.name}</h2>
			<p class="warn-text status-warn">▲ Copy it now: it's shown only this once.</p>
			<CopyField id="made-token" label="Access token" text={created.token} />
			<p class="small">Paste it into your app or script, as below. Anyone with it can read the tanks you picked, so keep it like a password.</p>
		</section>
	{/if}

	<section aria-labelledby="list-h" class="block">
		<h2 id="list-h" class="kicker">Connected · {data.tokens.length}</h2>
		<TokenList
			tokens={data.tokens}
			tanks={data.tanks}
			page="/settings/assistant"
			bind:editing
			editError={form?.edit ? { id: form.edit.id, message: editErr.tanks } : null}
			legend="Tanks it can read"
			reach={(names) => `Reads ${names}`}
			meta={(t) => `${t.bySignIn ? 'Connected by signing in' : 'Made'} ${fmtWhen(t.createdAt, tz)} · ${t.lastUsedAt ? `Last used ${fmtWhen(t.lastUsedAt, tz)}` : 'Not used yet'}`}
			revokeBody="It stops reading your tanks straight away. To connect it again, make a new token."
			empty="No assistant connected. Nothing can read your tanks until you connect one."
		/>
	</section>

	<section class="block" aria-labelledby="how-h">
		<h2 id="how-h" class="kicker">How to connect</h2>
		<p class="small">
			Waterline is an MCP server. Add it to your assistant with this address, then sign in to Waterline when it asks, pick the tanks and choose Allow. It shows up
			under Connected.
		</p>
		<CopyField id="how-url" label="Server address" text={data.mcpUrl} />
		<div class="apps">
			<details>
				<summary>claude.ai, Claude Desktop and mobile</summary>
				<ol>
					<li>On claude.ai, open Settings › Connectors and choose Add custom connector.</li>
					<li>Name it Waterline, paste the server address, and add it.</li>
					<li>Choose Connect, sign in to Waterline, pick the tanks and choose Allow.</li>
				</ol>
				<p class="small">It's then in the Claude Desktop and mobile apps too. On a Team or Enterprise plan, an owner may need to add it first.</p>
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
					<li>In a terminal, add Waterline:<CopyField id="how-code" label="Claude Code command" text={claudeCode} /></li>
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
		<p class="small">These apps rename their menus now and then: if a name differs, look for Connectors or MCP servers.</p>
	</section>

	<section class="block" aria-labelledby="tok-h">
		<h2 id="tok-h" class="kicker">Or use an access token</h2>
		<p class="small">For scripts, the JSON API and apps that can't sign in. You copy it once, into the app.</p>
		{#if data.tanks.length}
			<form method="POST" action="?/create" class="add" id="add" use:enhance={keepValues}>
				<div class="field name-field">
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
				<TankChecks prefix="a" legend="Tanks it can read" tanks={data.tanks} picked={createPicked} error={createErr.tanks} />
				<p class="small">Tanks you add later aren't shared until you tick them here.</p>
				<button class="btn btn-primary go">Create access token</button>
			</form>
		{/if}
		<p class="small">{created ? 'These have your new token in them.' : 'Put your token in place of <your token>.'}</p>
		<CopyField id="tok-header" label="MCP clients: send this header" text={`Authorization: Bearer ${token}`} />
		<CopyField id="tok-api" label="The JSON API" text={curl} />
		<p class="small">
			Also <span class="mono">/tanks/&lt;id&gt;/summary</span>, <span class="mono">readings</span>, <span class="mono">history</span>,
			<span class="mono">livestock</span>, <span class="mono">trends</span> and <span class="mono">photos</span>, and <span class="mono">/photos/&lt;id&gt;</span>.
		</p>
		<p class="small">
			Tables across all your tanks, for a dashboard or a spreadsheet: <span class="mono">/overview</span>, <span class="mono">/readings</span>,
			<span class="mono">/water-changes</span>, <span class="mono">/tasks</span> and <span class="mono">/spending</span>. Add <span class="mono">?format=csv</span> for a CSV.
		</p>
	</section>
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
		max-width: 680px;
	}
	/* a kicker over a 2px ink rule, then the block */
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 12px;
		border-top: 2px solid var(--ink);
	}
	.block h2 {
		margin: 0;
		font-weight: 400;
	}
	.small {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	/* a new token: a 2px accent box, shown once */
	.made {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px;
		border: 2px solid var(--accent);
	}
	.made h2 {
		margin: 0;
		font-size: 15px;
	}
	.warn-text {
		margin: 0;
		font-size: 13px;
	}
	.name-field {
		max-width: 320px;
	}
	/* one app's steps, opened on tap (works without scripts) */
	.apps {
		border-top: 1px solid var(--divider);
	}
	details {
		border-bottom: 1px solid var(--divider);
	}
	summary {
		min-height: 46px;
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
		gap: 6px;
		font-size: 14px;
		line-height: 1.5;
	}
	details ol :global(.field) {
		margin-top: 8px;
	}
	details > p.small {
		margin: -4px 0 14px;
	}
	.add {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.go {
		min-height: 48px;
	}
	@media (min-width: 1024px) {
		h1 {
			font-size: 22px;
		}
		.go {
			align-self: flex-start;
			min-height: 44px;
			padding: 0 22px;
		}
	}
</style>
