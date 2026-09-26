<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	let { data, form } = $props();

	let provider = $state(untrack(() => data.mail.provider));
	let showKey = $state(false);
	let busy = $state<string | null>(null);
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const test = $derived(form && 'test' in form ? form.test : null);
</script>

<svelte:head><title>Server settings · Waterline</title></svelte:head>

<div class="page">
	<a class="back" href="/settings">‹ Settings</a>
	<div class="head">
		<h1>Server settings</h1>
		<span class="badge">Admin</span>
	</div>
	<p class="muted">Only visible to the server owner.</p>

	<form
		method="POST"
		action="?/save"
		class="card sec"
		use:enhance={({ action }) => {
			busy = action.search.includes('test') ? 'test' : 'save';
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		}}
	>
		<div>
			<h2>Email delivery</h2>
			<p class="muted sm">Used for reminders, alerts and digests for everyone on this server.</p>
		</div>
		{#if data.outbox}
			<p class="banner banner-ok">Outbox mode (EMAIL_TRANSPORT=outbox): emails are written to files in the data folder, not sent.</p>
		{/if}
		{#if !data.originSet}
			<p class="banner banner-bad">Set ORIGIN to this server's public address, or links in emails won't work.</p>
		{/if}

		<div class="segmented">
			<label><input type="radio" name="provider" value="mailgun" bind:group={provider} />Mailgun</label>
			<label><input type="radio" name="provider" value="smtp" bind:group={provider} />Custom SMTP</label>
		</div>

		{#if provider === 'mailgun'}
			<p class="muted sm">Custom SMTP works with any provider or your own mail server.</p>
			<div class="field">
				<label class="label" for="mg-key">API key</label>
				<div class="unit-input">
					<input
						id="mg-key"
						name="mailgunApiKey"
						type={showKey ? 'text' : 'password'}
						autocomplete="off"
						placeholder={data.mail.hasMailgunKey ? '•••••••••••••••• saved — leave empty to keep' : 'key-…'}
						aria-invalid={!!errors.mailgunApiKey}
					/>
					<button type="button" class="btn-text" onclick={() => (showKey = !showKey)}>{showKey ? 'Hide' : 'Show'}</button>
				</div>
				{#if errors.mailgunApiKey}<span class="error-text">✕ {errors.mailgunApiKey}</span>{/if}
			</div>
			<div class="field">
				<label class="label" for="mg-domain">Sending domain</label>
				<input class="input" id="mg-domain" name="mailgunDomain" defaultValue={data.mail.mailgunDomain} placeholder="mg.example.com" aria-invalid={!!errors.mailgunDomain} />
				{#if errors.mailgunDomain}<span class="error-text">✕ {errors.mailgunDomain}</span>{/if}
			</div>
			<fieldset class="field">
				<legend class="label">Region</legend>
				<div class="segmented">
					<label><input type="radio" name="mailgunRegion" value="us" defaultChecked={data.mail.mailgunRegion === 'us'} />US</label>
					<label><input type="radio" name="mailgunRegion" value="eu" defaultChecked={data.mail.mailgunRegion === 'eu'} />EU</label>
				</div>
			</fieldset>
		{:else}
			<p class="muted sm">Works with any provider or your own mail server.</p>
			<div class="pair">
				<div class="field grow2">
					<label class="label" for="smtp-host">Server</label>
					<input class="input" id="smtp-host" name="smtpHost" defaultValue={data.mail.smtpHost} placeholder="smtp.example.com" aria-invalid={!!errors.smtpHost} />
					{#if errors.smtpHost}<span class="error-text">✕ {errors.smtpHost}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="smtp-port">Port</label>
					<input class="input" id="smtp-port" name="smtpPort" inputmode="numeric" defaultValue={data.mail.smtpPort} aria-invalid={!!errors.smtpPort} />
					{#if errors.smtpPort}<span class="error-text">✕ {errors.smtpPort}</span>{/if}
				</div>
			</div>
			<div class="trow">
				<label for="smtp-tls" class="ttext"><span class="tt">Use TLS</span><span class="td">Port 465 connects with TLS; other ports require STARTTLS.</span></label>
				<span class="switch"><input id="smtp-tls" type="checkbox" name="smtpSecure" defaultChecked={data.mail.smtpSecure} /><span></span></span>
			</div>
			<div class="pair">
				<div class="field">
					<label class="label" for="smtp-user">Username</label>
					<input class="input" id="smtp-user" name="smtpUser" defaultValue={data.mail.smtpUser} autocomplete="off" />
				</div>
				<div class="field">
					<label class="label" for="smtp-pass">Password</label>
					<input class="input" id="smtp-pass" name="smtpPassword" type="password" autocomplete="new-password" placeholder={data.mail.hasSmtpPassword ? '•••••••• saved' : ''} />
				</div>
			</div>
		{/if}

		<div class="field">
			<label class="label" for="sender">Sender</label>
			<input class="input" id="sender" name="sender" defaultValue={data.mail.sender} placeholder="Waterline <tanks@example.com>" aria-invalid={!!errors.sender} />
			{#if errors.sender}<span class="error-text">✕ {errors.sender}</span>{/if}
		</div>

		<div class="actions">
			<button class="btn" formaction="?/test" disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
			<button class="btn btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
		</div>
		{#if test}
			<p class="result" class:status-ok={test.ok} class:status-bad={!test.ok} role="status">{test.ok ? '✓' : '✕'} {test.message}</p>
		{:else if form && 'saved' in form && form.saved}
			<p class="result status-ok" role="status">✓ Saved</p>
		{/if}
	</form>

	<section class="card sec">
		<h2>Sign-in</h2>
		<div class="kv">
			<div>
				<div class="tt">Google sign-in</div>
				<div class="td">{data.signIn.googleClient ? `client ${data.signIn.googleClient}` : 'Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET'}</div>
				<div class="td">Set via environment variables</div>
			</div>
			<span class={data.signIn.google ? 'status-ok strong' : 'status-bad strong'}>{data.signIn.google ? '✓ Configured' : '✕ Not set'}</span>
		</div>
		<div class="kv">
			<div>
				<div class="tt">Local admin login</div>
				<div class="td">Fallback if Google sign-in fails. Turn on with LOCAL_ADMIN_PASSWORD_HASH.</div>
			</div>
			<span class={data.signIn.localAdmin ? 'status-ok strong' : 'muted'}>{data.signIn.localAdmin ? '✓ On' : 'Off'}</span>
		</div>
	</section>

	<section class="card sec">
		<h2>Server</h2>
		<pre class="mono info">version  {data.server.version}
data     {data.server.data}
users    {data.server.users}</pre>
	</section>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 640px;
	}
	.back {
		font-size: 16px;
		font-weight: 600;
		min-height: 36px;
		display: flex;
		align-items: center;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.head + p {
		margin: -8px 0 0;
	}
	.badge {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--selected);
		color: var(--accent);
	}
	.sec {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 19px;
		font-weight: 600;
	}
	.sm {
		font-size: 14px;
		margin: 0;
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
	.pair {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 12px;
	}
	.pair:not(:has(.grow2)) {
		grid-template-columns: 1fr 1fr;
	}
	.trow,
	.kv {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.kv + .kv {
		border-top: 1px solid var(--border);
		padding-top: 14px;
	}
	.ttext {
		display: flex;
		flex-direction: column;
		gap: 2px;
		cursor: pointer;
	}
	.tt {
		font-size: 16px;
		font-weight: 600;
	}
	.td {
		font-size: 13px;
		color: var(--text-muted);
	}
	.strong {
		font-weight: 600;
		white-space: nowrap;
	}
	.actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.result {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.info {
		margin: 0;
		font-size: 13px;
		line-height: 1.7;
		color: var(--text-2);
		white-space: pre-wrap;
		word-break: break-all;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
