<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { toast } from '$lib/ui.svelte';
	import SectionLink from '$lib/components/SectionLink.svelte';
	import { SERVER_SECTIONS } from '$lib/settings-sections';
	let { data, form } = $props();

	// who else may sign in with Google
	const MODES = [
		{ value: 'admin', label: 'Only the admin', d: 'Nobody else can sign in' },
		{ value: 'list', label: 'The admin and these people', d: 'The emails and whole domains you list' },
		{ value: 'open', label: 'Anyone with a Google account', d: 'Anyone who finds this server can make an account' }
	] as const;
	const googleErrors = $derived((form?.googleErrors ?? {}) as Record<string, string>);
	const accessErrors = $derived((form?.accessErrors ?? {}) as Record<string, string>);
	const localErrors = $derived((form?.localErrors ?? {}) as Record<string, string>);
	/** A form that saves in place and says so. */
	const saved =
		(message: string | ((data: Record<string, unknown> | undefined) => string)): SubmitFunction =>
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') toast(typeof message === 'string' ? message : message(result.data));
		};

	let provider = $state(untrack(() => data.mail.provider));
	let showKey = $state(false);
	let busy = $state<string | null>(null);
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
	const stockResult = $derived(form && 'stock' in form ? (form.stock as { ok: boolean; message: string }) : null);
	const stock = $derived(data.server.stock);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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

	<!-- phones: where each part is; the desktop menu lists them beside the page -->
	<nav class="jump hide-desk" aria-label="On this page">
		{#each SERVER_SECTIONS as sec (sec.id)}<a href="#{sec.id}">{sec.label}</a>{/each}
	</nav>

	<section class="sec" id="sign-in" aria-labelledby="signin-h">
		<div class="sec-head">
			<h2 id="signin-h">Sign-in<SectionLink id="sign-in" label="Sign-in" /></h2>
			<p class="sub">How people sign in to this server, and who can.</p>
		</div>

		<form method="POST" action="?/saveGoogle" class="block" id="google" use:enhance={saved((d) => (d?.needsAdmin ? "✓ Google sign-in saved. Now enter your Google account as the admin's, under Who can sign in." : '✓ Google sign-in saved'))}>
			<div class="line">
				<h3>Google sign-in<SectionLink id="google" label="Google sign-in" /></h3>
				<span class="state {data.signIn.google.on ? 'status-ok' : 'status-none'}">{data.signIn.google.on ? '✓ On' : '– Off'}</span>
			</div>
			{#if data.signIn.google.fromEnv}
				<p class="hint">Set by environment variables now (client <span class="mono">{data.signIn.google.fromEnv}</span>). A client saved here takes over.</p>
			{/if}
			<div class="field">
				<label class="label" for="g-id">Client ID</label>
				<input
					class="input mono"
					id="g-id"
					name="googleClientId"
					defaultValue={data.signIn.google.clientId}
					placeholder="….apps.googleusercontent.com"
					autocomplete="off"
					spellcheck="false"
					aria-invalid={!!googleErrors.googleClientId}
				/>
				{#if googleErrors.googleClientId}<span class="error-text">✕ {googleErrors.googleClientId}</span>{/if}
			</div>
			<div class="field">
				<label class="label" for="g-secret">Client secret</label>
				<input
					class="input mono"
					id="g-secret"
					name="googleClientSecret"
					type="password"
					autocomplete="off"
					placeholder={data.signIn.google.hasSecret ? 'Saved · leave empty to keep it' : ''}
					aria-invalid={!!googleErrors.googleClientSecret}
				/>
				{#if googleErrors.googleClientSecret}<span class="error-text">✕ {googleErrors.googleClientSecret}</span>{/if}
			</div>
			<div class="field">
				<span class="label">Authorized redirect URI</span>
				<code class="uri mono">{data.signIn.redirectUri}</code>
				<span class="hint"
					>In Google Cloud Console › Credentials, create an OAuth client ID for a web application and add this redirect URI.{data.signIn.plainHttp
						? ' Google only accepts https addresses.'
						: ''} Empty the client ID to turn Google sign-in off.</span
				>
			</div>
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>

		<form method="POST" action="?/saveAccess" class="block access" id="who-can-sign-in" use:enhance={saved('✓ Sign-in settings saved')}>
			<h3>Who can sign in<SectionLink id="who-can-sign-in" label="Who can sign in" /></h3>
			{#if data.signIn.needsAdmin}
				<p class="banner banner-warn">▲ Enter your own Google account as the admin's, then save, to sign in with Google. Until then it turns you away too.</p>
			{/if}
			{#if data.signIn.accessFromEnv}
				<p class="hint">Set by environment variables now (ALLOWED_EMAILS, OPEN_SIGNUP). Saving here takes over.</p>
			{/if}
			<div class="field">
				<label class="label" for="a-admin">Admin's Google account</label>
				<input
					class="input"
					id="a-admin"
					name="adminEmail"
					type="email"
					defaultValue={data.signIn.adminEmail}
					placeholder={data.signIn.adminEmailEnv ?? 'you@gmail.com'}
					autocomplete="off"
					aria-invalid={!!accessErrors.adminEmail}
				/>
				<span class="hint">Becomes an admin when it signs in, like the local admin login.</span>
				{#if accessErrors.adminEmail}<span class="error-text">✕ {accessErrors.adminEmail}</span>{/if}
			</div>
			<fieldset>
				<legend class="label">With a Google account, also</legend>
				<div class="group">
					{#each MODES as m (m.value)}
						<label class="row choice">
							<input type="radio" name="signupMode" value={m.value} defaultChecked={data.signIn.mode === m.value} />
							<span class="ttext"><span class="tt">{m.label}</span><span class="td">{m.d}</span></span>
						</label>
					{/each}
				</div>
			</fieldset>
			<div class="field list-field">
				<label class="label" for="a-list">Emails and domains</label>
				<textarea
					class="input area mono"
					id="a-list"
					name="allowedEmails"
					rows="4"
					defaultValue={data.signIn.list}
					placeholder={'me@example.com\n@family.example'}
					aria-invalid={!!accessErrors.allowedEmails}
				></textarea>
				<span class="hint">One per line. @family.example lets in everyone at that domain. Someone taken off is signed out on their next visit.</span>
				{#if accessErrors.allowedEmails}<span class="error-text">✕ {accessErrors.allowedEmails}</span>{/if}
			</div>
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>

		<form method="POST" action="?/saveLocal" class="block" id="local-admin" use:enhance={saved((d) => (d?.localSaved === 'off' ? 'Local admin login turned off' : '✓ Local admin login saved'))}>
			<div class="line">
				<h3>Local admin login<SectionLink id="local-admin" label="Local admin login" /></h3>
				<span class="state {data.signIn.local.on ? 'status-ok' : 'status-none'}">{data.signIn.local.on ? '✓ On' : '– Off'}</span>
			</div>
			<p class="hint">
				A username and password for the admin, for when Google sign-in isn't set up or doesn't work.{data.signIn.local.fromEnv
					? ' The password in LOCAL_ADMIN_PASSWORD_HASH works too.'
					: ''}
			</p>
			<div class="field">
				<label class="label" for="l-user">Username</label>
				<input class="input" id="l-user" name="username" defaultValue={data.signIn.local.username} autocomplete="username" autocapitalize="off" spellcheck="false" aria-invalid={!!localErrors.username} />
				{#if localErrors.username}<span class="error-text">✕ {localErrors.username}</span>{/if}
			</div>
			<div class="pair pw">
				<div class="field">
					<label class="label" for="l-pw">{data.signIn.local.fromApp ? 'New password' : 'Password'}</label>
					<input
						class="input"
						id="l-pw"
						name="password"
						type="password"
						autocomplete="new-password"
						placeholder={data.signIn.local.fromApp ? 'Leave empty to keep it' : ''}
						aria-invalid={!!localErrors.password}
					/>
				</div>
				<div class="field">
					<label class="label" for="l-pw2">Password again</label>
					<input class="input" id="l-pw2" name="confirm" type="password" autocomplete="new-password" aria-invalid={!!localErrors.confirm} />
				</div>
			</div>
			{#if localErrors.password}<span class="error-text">✕ {localErrors.password}</span>{/if}
			{#if localErrors.confirm}<span class="error-text">✕ {localErrors.confirm}</span>{/if}
			<div class="actions">
				{#if data.signIn.local.fromApp}<button class="btn" name="off" value="1">Turn off</button>{/if}
				<button class="btn btn-primary">Save</button>
			</div>
		</form>
	</section>

	<form
		method="POST"
		action="?/save"
		class="sec"
		id="email"
		aria-labelledby="email-h"
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
			<h2 id="email-h">Email delivery<SectionLink id="email" label="Email delivery" /></h2>
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
			<input class="input mono" id="sender" name="sender" defaultValue={data.mail.sender} placeholder={'Waterline <tanks@example.com>'} aria-invalid={!!errors.sender} />
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
		id="public-pages"
		aria-labelledby="public-h"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast('✓ Public page settings saved');
			}}
	>
		<div class="sec-head">
			<h2 id="public-h">Public pages<SectionLink id="public-pages" label="Public pages" /></h2>
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

		<div class="sec-head next" id="analytics">
			<h2>Analytics<SectionLink id="analytics" label="Analytics" /></h2>
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

	<section class="sec" id="features" aria-labelledby="features-h">
		<div class="sec-head">
			<h2 id="features-h">Features<SectionLink id="features" label="Features" /></h2>
			<p class="sub">What this server does by itself, for everyone on it.</p>
		</div>
		<form method="POST" action="?/saveServer" class="block" use:enhance={saved('✓ Server settings saved')}>
			<div class="group">
				<div class="row">
					<label for="sv-emails" class="ttext"
						><span class="tt">Send reminders and digests</span><span class="td"
							>{data.server.schedulerOff
								? 'Off: EMAIL_SCHEDULER=off is set.'
								: 'Checked every 5 minutes, for everyone on this server, by email and push. Alerts for readings out of range go out either way.'}</span
						></label
					>
					<span class="switch"><input id="sv-emails" type="checkbox" name="scheduledEmails" defaultChecked={data.server.scheduledEmails && !data.server.schedulerOff} disabled={data.server.schedulerOff} /><span></span></span>
				</div>
				<div class="row">
					<label for="sv-update" class="ttext"
						><span class="tt">Check for new versions</span><span class="td"
							>{data.server.updateCheckOff
								? 'Off: UPDATE_CHECK=off is set.'
								: "Reads Waterline's changelog on GitHub twice a day, and tells admins when there's a new version."}</span
						></label
					>
					<span class="switch"><input id="sv-update" type="checkbox" name="updateCheck" defaultChecked={data.server.updateCheck && !data.server.updateCheckOff} disabled={data.server.updateCheckOff} /><span></span></span>
				</div>
				<div class="row" id="species-photos">
					<label for="sv-stock" class="ttext"
						><span class="tt">Species photos</span><span class="td"
							>{data.server.stockPhotosOff
								? 'Off: STOCK_PHOTOS=off is set.'
								: 'Photos of plants and livestock from Wikimedia Commons, where there isn’t one of your own. Downloaded once, kept on this server, and shown with their credit.'}</span
						></label
					>
					<span class="switch"><input id="sv-stock" type="checkbox" name="stockPhotos" defaultChecked={data.server.stockPhotos && !data.server.stockPhotosOff} disabled={data.server.stockPhotosOff} /><span></span></span>
				</div>
			</div>
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>
		{#if stock}
			<form
				method="POST"
				action="?/stockLookAgain"
				class="block stock"
				use:enhance={() => {
					busy = 'stock';
					return async ({ update }) => {
						await update({ reset: false });
						busy = null;
					};
				}}
			>
				<div class="group">
					<div class="row">
						<span class="ttext"
							><span class="tt">Species photos</span><span class="td"
								>{stock.found || stock.none || stock.failed
									? [
											stock.found && `${stock.found} found`,
											stock.none && `${plural(stock.none, 'species')} with no photo to use`,
											stock.failed && `${plural(stock.failed, 'species', 'species')} couldn't be fetched`,
											stock.pending && `${stock.pending} on the way`
										]
											.filter(Boolean)
											.join(' · ')
									: 'None looked up yet. They come in as you open Plants and Livestock.'}</span
							>{#if stock.failed && stock.reason}<span class="td">Last problem: <span class="mono">{stock.reason}</span></span>{/if}</span
						>
						<button class="btn look" disabled={busy === 'stock'}>{busy === 'stock' ? 'Looking…' : 'Look again now'}</button>
					</div>
				</div>
				{#if stockResult}
					<p class="result {stockResult.ok ? 'ok' : 'bad'}" role="status">{stockResult.message}</p>
				{/if}
			</form>
		{/if}
	</section>

	<section class="sec" id="about" aria-labelledby="about-h">
		<h2 id="about-h">Logs & version<SectionLink id="about" label="Logs & version" /></h2>
		<div class="group">
			<a class="row logs" href="/settings/server/logs">
				<span class="ttext"
					><span class="tt">Logs</span><span class="td"
						>{data.logs.error || data.logs.warn
							? [data.logs.error && `${data.logs.error} error${data.logs.error === 1 ? '' : 's'}`, data.logs.warn && `${data.logs.warn} warning${data.logs.warn === 1 ? '' : 's'}`]
									.filter(Boolean)
									.join(' and ') + ' in the last day'
							: 'Nothing went wrong in the last day'}</span
					></span
				>
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</div>
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
		border-radius: 0;
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
	/* phones: one password field under the other, so the hint fits */
	@media (max-width: 1023px) {
		.pair.pw {
			grid-template-columns: 1fr;
		}
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
		border-radius: 0;
	}
	.segmented.region label {
		min-height: 0;
		border-radius: 0;
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
		border-radius: 0;
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
		border-radius: 0;
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
	/* Sign-in: three forms under one heading */
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.block + .block {
		margin-top: 10px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}
	h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.uri {
		display: block;
		padding: 10px 12px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 13px;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.choice {
		cursor: pointer;
	}
	.choice input {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		accent-color: var(--accent);
	}
	.area {
		height: auto;
		min-height: 104px;
		padding: 10px 14px;
		line-height: 1.5;
		resize: vertical;
	}
	/* the list, only when "these people" is picked (no script needed) */
	.list-field {
		display: none;
	}
	.access:has(input[name='signupMode'][value='list']:checked) .list-field {
		display: flex;
	}
	.logs {
		color: var(--text);
	}
	/* a shared link lands on the heading, not under the header */
	.sec,
	.block,
	#analytics,
	#species-photos {
		scroll-margin-top: 16px;
	}
	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: -6px;
	}
	.jump a {
		min-height: 44px;
		padding: 0 14px;
		display: flex;
		align-items: center;
		border-radius: 0;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
	}
	.look {
		flex-shrink: 0;
		height: 44px;
		padding: 0 14px;
	}
	.logs .chev {
		font-size: 18px;
		color: var(--placeholder);
	}
	.info {
		margin: 0;
		padding: 14px;
		border-radius: 0;
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
			border-radius: 0;
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
			border-radius: 0;
		}
		.segmented.provider label {
			min-height: 36px;
			border-radius: 0;
			font-size: 14px;
		}
		.pair.domain {
			grid-template-columns: minmax(0, 1fr) 150px;
		}
		.segmented.region {
			height: 44px;
			border-radius: 0;
		}
		.segmented.region label {
			border-radius: 0;
		}
		.actions .btn {
			flex: none;
			height: 44px;
			padding: 0 18px;
			border-radius: 0;
		}
		.row {
			padding: 14px 16px;
		}
		.tt {
			font-size: 15px;
		}
	}
</style>
