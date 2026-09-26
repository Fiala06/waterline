<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { toast } from '$lib/ui.svelte';
	let { data, form } = $props();

	let provider = $state(untrack(() => data.mail.provider));
	let showKey = $state(false);
	let busy = $state<string | null>(null);
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const test = $derived(form && 'test' in form ? form.test : null);
	// 18: the first sentence in bold, a trailing "(401 Unauthorized)" in mono
	const result = $derived.by(() => {
		if (!test) return null;
		const m = test.message.match(/^(.*?)\s*(\([^()]*\))?$/s);
		const body = m?.[1] ?? test.message;
		const cut = test.ok ? body.indexOf(' to ') : body.indexOf('. ');
		return {
			lead: cut > 0 ? body.slice(0, test.ok ? cut : cut + 1) : body,
			rest: cut > 0 ? body.slice(cut + (test.ok ? 1 : 2)) : '',
			code: m?.[2] ?? ''
		};
	});
</script>

<svelte:head><title>Server settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<a class="back sub-back" href="/settings">‹ Settings</a>
	<div class="head hide-desk">
		<div class="title-row">
			<h1>Server settings</h1>
			<span class="badge">Admin</span>
		</div>
		<p class="muted">Only visible to the server owner.</p>
	</div>

	<form
		method="POST"
		action="?/save"
		class="sec"
		use:enhance={({ action }) => {
			busy = action.search.includes('test') ? 'test' : 'save';
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = null;
				if (result.type === 'success' && result.data?.saved) toast('✓ Email settings saved');
			};
		}}
	>
		<div class="sec-head">
			<h2>Email delivery</h2>
			<p class="sub hide-phone">Used for reminders, alerts and digests for everyone on this server.</p>
		</div>
		{#if data.outbox}
			<p class="banner banner-warn">▲ Outbox mode (EMAIL_TRANSPORT=outbox): emails are written to files in the data folder, not sent.</p>
		{/if}
		{#if !data.originSet}
			<p class="banner banner-warn">▲ Set ORIGIN to this server's public address, or links in emails won't work.</p>
		{/if}

		<div class="segmented provider" role="radiogroup" aria-label="Email provider">
			<label><input type="radio" name="provider" value="mailgun" bind:group={provider} />Mailgun</label>
			<label><input type="radio" name="provider" value="smtp" bind:group={provider} />Custom SMTP</label>
		</div>

		{#if provider === 'mailgun'}
			<p class="hint">Custom SMTP works with any provider or your own mail server.</p>
			<div class="field">
				<label class="label" for="mg-key">API key</label>
				<div class="unit-input">
					<input
						id="mg-key"
						name="mailgunApiKey"
						type={showKey ? 'text' : 'password'}
						autocomplete="off"
						placeholder={data.mail.hasMailgunKey ? '•••••••• saved — leave empty to keep' : 'key-…'}
						aria-invalid={!!errors.mailgunApiKey}
					/>
					<button type="button" class="btn-text" onclick={() => (showKey = !showKey)}>{showKey ? 'Hide' : 'Show'}</button>
				</div>
				{#if errors.mailgunApiKey}<span class="error-text">✕ {errors.mailgunApiKey}</span>{/if}
			</div>
			<div class="pair domain">
				<div class="field">
					<label class="label" for="mg-domain">Sending domain</label>
					<input class="input mono" id="mg-domain" name="mailgunDomain" defaultValue={data.mail.mailgunDomain} placeholder="mg.example.com" aria-invalid={!!errors.mailgunDomain} />
					{#if errors.mailgunDomain}<span class="error-text">✕ {errors.mailgunDomain}</span>{/if}
				</div>
				<fieldset class="field">
					<legend class="label">Region</legend>
					<div class="segmented region">
						<label><input type="radio" name="mailgunRegion" value="us" defaultChecked={data.mail.mailgunRegion === 'us'} />US</label>
						<label><input type="radio" name="mailgunRegion" value="eu" defaultChecked={data.mail.mailgunRegion === 'eu'} />EU</label>
					</div>
				</fieldset>
			</div>
		{:else}
			<p class="hint">Works with any provider or your own mail server.</p>
			<div class="pair host">
				<div class="field">
					<label class="label" for="smtp-host">Server</label>
					<input class="input mono" id="smtp-host" name="smtpHost" defaultValue={data.mail.smtpHost} placeholder="smtp.example.com" aria-invalid={!!errors.smtpHost} />
					{#if errors.smtpHost}<span class="error-text">✕ {errors.smtpHost}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="smtp-port">Port</label>
					<input class="input" id="smtp-port" name="smtpPort" inputmode="numeric" defaultValue={data.mail.smtpPort} aria-invalid={!!errors.smtpPort} />
					{#if errors.smtpPort}<span class="error-text">✕ {errors.smtpPort}</span>{/if}
				</div>
			</div>
			<div class="group">
				<div class="row">
					<label for="smtp-tls" class="ttext"><span class="tt">Use TLS</span><span class="td">Port 465 connects with TLS; other ports require STARTTLS.</span></label>
					<span class="switch"><input id="smtp-tls" type="checkbox" name="smtpSecure" defaultChecked={data.mail.smtpSecure} /><span></span></span>
				</div>
			</div>
			<div class="pair">
				<div class="field">
					<label class="label" for="smtp-user">Username</label>
					<input class="input" id="smtp-user" name="smtpUser" defaultValue={data.mail.smtpUser} autocomplete="off" />
				</div>
				<div class="field">
					<label class="label" for="smtp-pass">Password</label>
					<input class="input" id="smtp-pass" name="smtpPassword" type="password" autocomplete="new-password" placeholder={data.mail.hasSmtpPassword ? '•••••••• saved' : ''} />
					{#if data.mail.hasSmtpPassword}<span class="hint">Changing the server? Enter its password again.</span>{/if}
				</div>
			</div>
		{/if}

		<div class="field">
			<label class="label" for="sender">Sender</label>
			<input class="input mono" id="sender" name="sender" defaultValue={data.mail.sender} placeholder="Waterline <tanks@example.com>" aria-invalid={!!errors.sender} />
			{#if errors.sender}<span class="error-text">✕ {errors.sender}</span>{/if}
		</div>

		<div class="actions">
			<button class="btn" formaction="?/test" disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
			<button class="btn btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
		</div>
		{#if test && result}
			<p class="result" class:ok={test.ok} class:bad={!test.ok} role="status">
				<strong>{test.ok ? '✓' : '✕'} {result.lead}</strong>{#if result.rest}{' '}{result.rest}{/if}{#if result.code}{' '}<span class="mono code"
						>{result.code}</span
					>{/if}
			</p>
		{/if}
	</form>

	<form
		method="POST"
		action="?/savePublic"
		class="sec"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast('✓ Public page settings saved');
			}}
	>
		<div class="sec-head">
			<h2>Public pages</h2>
			<p class="sub">Applies to everyone on this server.</p>
		</div>
		<div class="group">
			{#each [{ k: 'allowPublicPages', t: 'Allow public tank pages', d: 'Users can publish tanks and share photo links', v: data.publicPages.allow }, { k: 'publicHomeEnabled', t: 'Public home page', d: `${data.publicPages.effectiveBase ? new URL(data.publicPages.effectiveBase).host : 'The home page'} lists all public tanks`, v: data.publicPages.home }] as row (row.k)}
				<div class="row">
					<label for="pp-{row.k}" class="ttext"><span class="tt">{row.t}</span><span class="td">{row.d}</span></label>
					<span class="switch"><input id="pp-{row.k}" type="checkbox" name={row.k} defaultChecked={row.v} /><span></span></span>
				</div>
			{/each}
			<div class="row">
				<div class="ttext">
					<span class="tt">Sitemap & robots.txt</span>
					<span class="td mono">/sitemap.xml · {data.publicPages.sitemapCount} public page{data.publicPages.sitemapCount === 1 ? '' : 's'}</span>
				</div>
				<span class="state status-ok">✓ Generated</span>
			</div>
		</div>
		<div class="field">
			<label class="label" for="pp-base">Public site URL</label>
			<input
				class="input mono"
				id="pp-base"
				name="publicBaseUrl"
				defaultValue={data.publicPages.baseUrl}
				placeholder={data.publicPages.effectiveBase || 'https://tanks.example.com'}
				aria-invalid={!!form?.publicErrors?.publicBaseUrl}
			/>
			<span class="hint">Used in share links, canonical URLs and the sitemap. Defaults to ORIGIN.</span>
			{#if form?.publicErrors?.publicBaseUrl}<span class="error-text">✕ {form.publicErrors.publicBaseUrl}</span>{/if}
		</div>

		<div class="sec-head next">
			<h2>Analytics</h2>
			<p class="sub">Loaded on public pages only. Never on signed-in app screens.</p>
		</div>
		<div class="field">
			<label class="label" for="pp-ga4">Google Analytics 4 measurement ID</label>
			<input class="input mono" id="pp-ga4" name="ga4Id" defaultValue={data.publicPages.ga4Id} placeholder="G-XXXXXXXXXX" aria-invalid={!!form?.publicErrors?.ga4Id} />
			{#if form?.publicErrors?.ga4Id}<span class="error-text">✕ {form.publicErrors.ga4Id}</span>{/if}
		</div>
		<div class="group">
			<div class="row">
				<label for="pp-consent" class="ttext"><span class="tt">Cookie consent banner</span><span class="td">Analytics loads only after the visitor accepts</span></label>
				<span class="switch"><input id="pp-consent" type="checkbox" name="consentBanner" defaultChecked={data.publicPages.consent} /><span></span></span>
			</div>
		</div>
		<div class="field">
			<label class="label two-line" for="pp-gsc">Google Search Console<span class="td">Verification meta tag</span></label>
			<input
				class="input mono"
				id="pp-gsc"
				name="searchConsoleTag"
				defaultValue={data.publicPages.searchConsoleTag}
				placeholder={'<meta name="google-site-verification" content="…">'}
				aria-invalid={!!form?.publicErrors?.searchConsoleTag}
			/>
			{#if form?.publicErrors?.searchConsoleTag}<span class="error-text">✕ {form.publicErrors.searchConsoleTag}</span>{/if}
		</div>
		<div class="actions"><button class="btn btn-primary">Save</button></div>
	</form>

	<section class="sec">
		<h2>Sign-in</h2>
		<div class="group">
			<div class="row">
				<div class="ttext">
					<span class="line">
						<span class="tt">Google sign-in</span>
						<span class="state {data.signIn.google ? 'status-ok' : 'status-bad'}">{data.signIn.google ? '✓ Configured' : '✕ Not set'}</span>
					</span>
					<span class="td mono">{data.signIn.googleClient ? `client ${data.signIn.googleClient}` : 'Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET'}</span>
					<span class="td">Set via environment variables</span>
				</div>
			</div>
			<div class="row">
				<div class="ttext">
					<span class="tt">Local admin login</span>
					<span class="td">Fallback if Google sign-in fails{data.signIn.localAdmin ? '' : '. Turn on with LOCAL_ADMIN_PASSWORD_HASH.'}</span>
				</div>
				<span class="state {data.signIn.localAdmin ? 'status-ok' : 'status-none'}">{data.signIn.localAdmin ? '✓ On' : '– Off'}</span>
			</div>
			<div class="row">
				<div class="ttext">
					<span class="tt">Who can sign in</span>
					<span class="td">{data.signIn.who}</span>
				</div>
			</div>
		</div>
	</section>

	<section class="sec">
		<h2>Server</h2>
		<pre class="card mono info">version  {data.server.version}
data     {data.server.data}
users    {data.server.users}</pre>
	</section>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 640px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.head p {
		margin: 0;
		font-size: 14px;
	}
	.badge {
		padding: 2px 7px;
		border-radius: 5px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.sec {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sec h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sec-head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sec-head.next {
		margin-top: 18px;
	}
	.sub {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-faint);
	}
	.banner {
		margin: 0;
	}

	/* fields (18): 13px labels, 48px inputs */
	.field {
		gap: 6px;
	}
	.field > .label {
		font-size: 13px;
	}
	.two-line {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.input,
	.unit-input {
		height: 48px;
		font-size: 16px;
	}
	.unit-input input {
		font-size: 16px;
	}
	.input.mono {
		font-size: 15px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 6px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.pair.host {
		grid-template-columns: 2fr 1fr;
	}
	.pair.domain {
		grid-template-columns: minmax(0, 1fr) 110px;
	}
	.segmented.provider label {
		min-height: 40px;
		font-size: 15px;
	}
	.segmented.region {
		height: 48px;
		border-radius: 12px;
	}
	.segmented.region label {
		min-height: 0;
		border-radius: 8px;
		font-size: 14px;
	}

	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		flex: 1;
		height: 48px;
	}
	.result {
		margin: 0;
		padding: 12px 14px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.4;
	}
	.result.ok {
		background: var(--ok-bg);
		color: var(--ok-text);
	}
	.result.bad {
		background: var(--bad-bg);
		color: var(--bad-text);
	}
	.code {
		font-size: 12px;
	}

	/* grouped rows: toggles and read-only settings */
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
		padding: 12px 16px;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.ttext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	label.ttext {
		cursor: pointer;
	}
	.tt {
		font-size: 16px;
	}
	.td {
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}
	.two-line .td {
		color: var(--text-faint);
	}
	/* D11: the status shares the title's line, so the client ID gets the full width */
	.line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.state {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.info {
		margin: 0;
		padding: 14px;
		border-radius: 14px;
		font-size: 13px;
		line-height: 1.8;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	@media (min-width: 1024px) {
		.page {
			gap: 36px;
		}
		.sec {
			gap: 16px;
		}
		.sec h2 {
			font-size: 22px;
			letter-spacing: normal;
			text-transform: none;
			color: var(--text);
		}
		.sec-head.next {
			margin-top: 20px;
		}
		.input,
		.unit-input {
			height: 44px;
			border-radius: 10px;
			font-size: 15px;
		}
		.unit-input input {
			font-size: 15px;
		}
		.input.mono {
			font-size: 14px;
		}
		.segmented.provider {
			max-width: 360px;
			border-radius: 12px;
		}
		.segmented.provider label {
			min-height: 36px;
			border-radius: 8px;
			font-size: 14px;
		}
		.pair.domain {
			grid-template-columns: minmax(0, 1fr) 150px;
		}
		.segmented.region {
			height: 44px;
			border-radius: 10px;
		}
		.segmented.region label {
			border-radius: 7px;
		}
		.actions .btn {
			flex: none;
			height: 44px;
			padding: 0 18px;
			border-radius: 10px;
		}
		.row {
			padding: 14px 16px;
		}
		.tt {
			font-size: 15px;
		}
	}
</style>
