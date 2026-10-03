<script lang="ts">
	// Settings › Server (redesign README § 16): the admin's page. A grid of its
	// parts at the top, then each part as a heading over a 2px ink rule, with
	// 13px labels over the fields and rows with 1px dividers.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { toast } from '$lib/ui.svelte';
	import SectionLink from '$lib/components/SectionLink.svelte';
	import { SERVER_SECTIONS } from '$lib/settings-sections';
	let { data, form } = $props();

	// who else may sign in with Google
	const MODES = [
		{ value: 'admin', label: 'Only the admin', d: 'Nobody else can sign in' },
		{ value: 'list', label: 'The admin and these people', d: 'The emails and whole domains you list, and anyone you invite' },
		{ value: 'invited', label: 'Invited people only', d: 'People you send an invitation to, under People' },
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
	const careResult = $derived(form && 'care' in form ? (form.care as { ok: boolean; message: string }) : null);
	const care = $derived(data.server.care);
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	const test = $derived(form && 'test' in form ? form.test : null);
	// the first sentence in bold, a trailing "(401 Unauthorized)" in mono
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

	// "Self-hosted at waterline.example.com · v1.9.1"
	// "3 people · 1 admin · 1 invitation pending"
	const peopleLine = $derived(
		[
			plural(data.server.users, 'person', 'people'),
			plural(data.people.admins, 'admin'),
			data.people.pending ? `${plural(data.people.pending, 'invitation')} pending` : ''
		]
			.filter(Boolean)
			.join(' · ')
	);
	const host = $derived.by(() => {
		try {
			return new URL(data.publicPages.effectiveBase || page.url.origin).host;
		} catch {
			return page.url.host;
		}
	});
	// the grid of parts follows the page as it scrolls
	let section = $state(SERVER_SECTIONS[0].id);
	$effect(() => {
		const ids = SERVER_SECTIONS.map((p) => p.id);
		const onScroll = () => {
			let current = ids[0];
			for (const id of ids) {
				const top = document.getElementById(id)?.getBoundingClientRect().top;
				if (top != null && top < 160) current = id;
			}
			if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = ids.at(-1)!;
			section = current;
		};
		onScroll();
		addEventListener('scroll', onScroll, { passive: true });
		return () => removeEventListener('scroll', onScroll);
	});
	const badge = (id: string) =>
		id === 'features' && data.app.update
			? `↑ ${data.app.update.version}`
			: id === 'about' && data.logs.error
				? `✕ ${data.logs.error}`
				: id === 'people'
					? String(data.server.users)
					: '';
	// the redirect URI, copied for Google Cloud Console
	let uriCopied = $state(false);
	async function copyUri() {
		try {
			await navigator.clipboard.writeText(data.signIn.redirectUri);
			uriCopied = true;
			setTimeout(() => (uriCopied = false), 2000);
		} catch {
			/* clipboard blocked: the address can still be selected */
		}
	}
	const googleHint = $derived(
		data.signIn.google.on
			? `Client …${(data.signIn.google.clientId || data.signIn.google.fromEnv || '').replace(/\.apps\.googleusercontent\.com$/, '').slice(-6)}`
			: 'Enter a client ID and secret below to turn it on'
	);
	const logsLine = $derived(
		data.logs.error || data.logs.warn
			? [data.logs.error && `${data.logs.error} error${data.logs.error === 1 ? '' : 's'}`, data.logs.warn && `${data.logs.warn} warning${data.logs.warn === 1 ? '' : 's'}`]
					.filter(Boolean)
					.join(' and ') + ' in the last day'
			: 'Nothing went wrong in the last day'
	);
</script>

<svelte:head><title>Server settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<a class="back sub-back" href="/settings">‹ Settings</a>
	<div class="head">
		<h1>Server</h1>
		<span class="tag tag-outline admin">ADMIN</span>
		<span class="meta">Self-hosted at {host} · v{data.server.version}</span>
	</div>

	<!-- the parts, each its own address; the one in view is filled -->
	<nav class="parts" aria-label="On this page">
		{#each SERVER_SECTIONS as sec (sec.id)}
			{@const b = badge(sec.id)}
			<a href="#{sec.id}" class:current={section === sec.id} aria-current={section === sec.id ? 'location' : undefined} aria-label={sec.label} title={b ? `${sec.label} · ${b}` : undefined}>
				<span>{sec.label}</span>{#if b}<span class="pb">{b}</span>{/if}
			</a>
		{/each}
	</nav>

	<section class="sec" id="sign-in" aria-labelledby="signin-h">
		<div class="sec-head">
			<h2 id="signin-h">Sign-in<SectionLink id="sign-in" label="Sign-in" /></h2>
			<p class="sub">How people sign in to this server, and who can.</p>
		</div>

		<form method="POST" action="?/saveGoogle" class="block" id="google" use:enhance={saved((d) => (d?.needsAdmin ? "✓ Google sign-in saved. Now enter your Google account as the admin's, under Who can sign in." : '✓ Google sign-in saved'))}>
			<div class="bhead">
				<h3>Google sign-in<SectionLink id="google" label="Google sign-in" /></h3>
				<p class="sub">People sign in with their Google account. Create an OAuth client (type Web application) in the Google Cloud console and add the redirect URI below.</p>
			</div>
			<div class="status">
				<b>{data.signIn.google.on ? '● On' : '○ Off'}</b><span>{googleHint}</span>
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
					placeholder="1234-abc.apps.googleusercontent.com"
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
				<div class="uri-line">
					<code class="uri mono">{data.signIn.redirectUri}</code>
					<button type="button" class="btn" onclick={copyUri}>{uriCopied ? '✓ Copied' : 'Copy'}<span class="sr-only"> the redirect URI</span></button>
				</div>
				<span class="hint"
					>In Google Cloud Console › Credentials, create an OAuth client ID for a web application and add this redirect URI.{data.signIn.plainHttp
						? ' Google only accepts https addresses.'
						: ''} Empty the client ID to turn Google sign-in off.</span
				>
			</div>
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>

		<form method="POST" action="?/saveAccess" class="block access" id="who-can-sign-in" use:enhance={saved('✓ Sign-in settings saved')}>
			<div class="bhead"><h3>Who can sign in<SectionLink id="who-can-sign-in" label="Who can sign in" /></h3></div>
			{#if data.signIn.needsAdmin}
				<p class="banner banner-warn">▲ Enter your own Google account as the admin's, then save, to sign in with Google. Until then it turns you away too.</p>
			{/if}
			{#if data.signIn.accessFromEnv}
				<p class="hint">Set by environment variables now (ALLOWED_EMAILS, OPEN_SIGNUP). Saving here takes over.</p>
			{/if}
			<fieldset>
				<legend class="label">With a Google account</legend>
				<div class="rows">
					{#each MODES as m (m.value)}
						<label class="row choice">
							<input class="radio" type="radio" name="signupMode" value={m.value} defaultChecked={data.signIn.mode === m.value} />
							<span class="ttext"><span class="tt">{m.label}</span><span class="td">{m.d}</span></span>
						</label>
					{/each}
				</div>
			</fieldset>
			<div class="field list-field">
				<label class="label" for="a-list">Emails and domains · one per line</label>
				<textarea
					class="input area mono"
					id="a-list"
					name="allowedEmails"
					rows="4"
					defaultValue={data.signIn.list}
					placeholder={'me@example.com\n@family.example'}
					aria-invalid={!!accessErrors.allowedEmails}
				></textarea>
				<span class="hint">@family.example lets in everyone at that domain. Someone taken off is signed out on their next visit.</span>
				{#if accessErrors.allowedEmails}<span class="error-text">✕ {accessErrors.allowedEmails}</span>{/if}
			</div>
			<div class="field narrow">
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
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>

		<form method="POST" action="?/saveLocal" class="block" id="local-admin" use:enhance={saved((d) => (d?.localSaved === 'off' ? 'Local admin login turned off' : '✓ Local admin login saved'))}>
			<div class="bhead">
				<div class="line">
					<h3>Local admin login<SectionLink id="local-admin" label="Local admin login" /></h3>
					<span class="state {data.signIn.local.on ? 'status-ok' : 'status-none'}">{data.signIn.local.on ? '● On' : '○ Off'}</span>
				</div>
				<p class="sub">
					A username and password for the admin, for when Google sign-in is off or not working. Without Google, it's the only way in.{data.signIn.local.fromEnv
						? ' The password in LOCAL_ADMIN_PASSWORD_HASH works too.'
						: ''}
				</p>
			</div>
			<div class="three">
				<div class="field">
					<label class="label" for="l-user">Username</label>
					<input class="input" id="l-user" name="username" defaultValue={data.signIn.local.username} autocomplete="username" autocapitalize="off" spellcheck="false" aria-invalid={!!localErrors.username} />
					{#if localErrors.username}<span class="error-text">✕ {localErrors.username}</span>{/if}
				</div>
				<div class="field">
					<label class="label" for="l-pw">{data.signIn.local.fromApp ? 'New password' : 'Password'}</label>
					<input
						class="input"
						id="l-pw"
						name="password"
						type="password"
						autocomplete="new-password"
						placeholder={data.signIn.local.fromApp ? 'Saved · leave blank to keep' : ''}
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
				<button class="btn btn-primary">Save</button>
				{#if data.signIn.local.fromApp}<button class="btn" name="off" value="1">Turn off</button>{/if}
			</div>
		</form>
	</section>

	<section class="sec" id="people" aria-labelledby="people-h">
		<div class="sec-head">
			<h2 id="people-h">People<SectionLink id="people" label="People" /></h2>
			<p class="sub">Everyone on this server, and invitations.</p>
		</div>
		<div class="rows">
			<a class="row logs" href="/settings/server/people">
				<span class="ttext"><span class="tt">People</span><span class="td">{peopleLine}</span></span>
				{#if data.people.pending}<span class="state status-warn">▲ {data.people.pending} pending</span>{/if}
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</div>
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
			<h2 id="email-h">Email<SectionLink id="email" label="Email" /></h2>
			<p class="sub">Used for reminders, alerts and digests for everyone on this server.</p>
		</div>
		<div class="mailbox">
			<span class="mb-text">
				<span class="mb-title">{data.mail.configured ? '✓ Email is set up' : '○ Email isn’t set up yet'}</span>
				<span class="mb-sub">{data.mail.configured ? `Sending as ${data.mail.sender || 'the default sender'}` : 'Reminders, alerts and digests wait until it is'}</span>
			</span>
			<button class="btn" formaction="?/test" disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
		</div>
		{#if test && result}
			<p class="result" class:ok={test.ok} class:bad={!test.ok} role="status">
				<strong>{test.ok ? '✓' : '✕'} {result.lead}</strong>{#if result.rest}{' '}{result.rest}{/if}{#if result.code}{' '}<span class="mono code"
						>{result.code}</span
					>{/if}
			</p>
		{/if}
		{#if data.outbox}
			<p class="banner banner-warn">▲ Outbox mode (EMAIL_TRANSPORT=outbox): emails are written to files in the data folder, not sent.</p>
		{/if}
		{#if !data.originSet}
			<p class="banner banner-warn">▲ Set ORIGIN to this server's public address, or links in emails won't work.</p>
		{/if}

		<fieldset class="field">
			<legend class="label">Send with</legend>
			<div class="segmented provider" role="radiogroup" aria-label="Email provider">
				<label><input type="radio" name="provider" value="mailgun" bind:group={provider} />Mailgun</label>
				<label><input type="radio" name="provider" value="smtp" bind:group={provider} />SMTP</label>
			</div>
		</fieldset>

		{#if provider === 'mailgun'}
			<div class="field">
				<label class="label" for="mg-key">API key</label>
				<div class="unit-input">
					<input
						id="mg-key"
						name="mailgunApiKey"
						type={showKey ? 'text' : 'password'}
						autocomplete="off"
						placeholder={data.mail.hasMailgunKey ? 'Saved · paste a new key to replace it' : 'key-…'}
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
				<div class="field">
					<label class="label" for="smtp-user">Username</label>
					<input class="input" id="smtp-user" name="smtpUser" defaultValue={data.mail.smtpUser} autocomplete="off" />
				</div>
				<div class="field">
					<label class="label" for="smtp-pass">Password</label>
					<input class="input" id="smtp-pass" name="smtpPassword" type="password" autocomplete="new-password" placeholder={data.mail.hasSmtpPassword ? 'Saved' : ''} />
					{#if data.mail.hasSmtpPassword}<span class="hint">Changing the server? Enter its password again.</span>{/if}
				</div>
			</div>
			<div class="rows">
				<div class="row">
					<label for="smtp-tls" class="ttext"><span class="tt">Use TLS</span><span class="td">Port 465 connects with TLS; other ports require STARTTLS.</span></label>
					<span class="switch"><input id="smtp-tls" type="checkbox" name="smtpSecure" defaultChecked={data.mail.smtpSecure} /><span></span></span>
				</div>
			</div>
		{/if}

		<div class="field narrow">
			<label class="label" for="sender">Sender</label>
			<input class="input mono" id="sender" name="sender" defaultValue={data.mail.sender} placeholder={'Waterline <tanks@example.com>'} aria-invalid={!!errors.sender} />
			{#if errors.sender}<span class="error-text">✕ {errors.sender}</span>{/if}
		</div>

		<div class="actions">
			<button class="btn btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
		</div>
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
			<p class="sub">Read-only pages people can share for a tank. Each owner picks what is shown. Applies to everyone on this server.</p>
		</div>
		<div class="rows">
			{#each [{ k: 'allowPublicPages', t: 'Public tank pages', d: 'Users can publish tanks and share photo links', v: data.publicPages.allow }, { k: 'publicHomeEnabled', t: 'Public home page', d: `${data.publicPages.effectiveBase ? new URL(data.publicPages.effectiveBase).host : 'The home page'} lists all public tanks`, v: data.publicPages.home }] as row (row.k)}
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
		<div class="field narrow">
			<label class="label" for="pp-base">Public site URL</label>
			<input
				class="input mono"
				id="pp-base"
				name="publicBaseUrl"
				defaultValue={data.publicPages.baseUrl}
				placeholder={data.publicPages.effectiveBase || 'https://tanks.example.com'}
				aria-invalid={!!form?.publicErrors?.publicBaseUrl}
			/>
			<span class="hint">Used in shared links, canonical URLs, the sitemap and social previews. Defaults to ORIGIN.</span>
			{#if form?.publicErrors?.publicBaseUrl}<span class="error-text">✕ {form.publicErrors.publicBaseUrl}</span>{/if}
		</div>

		<div class="bhead" id="analytics">
			<h3>Analytics<SectionLink id="analytics" label="Analytics" /></h3>
			<p class="sub">Counts visits to public pages only, never inside the app.</p>
		</div>
		<div class="field ga">
			<label class="label" for="pp-ga4">Google Analytics 4 measurement ID</label>
			<input class="input mono" id="pp-ga4" name="ga4Id" defaultValue={data.publicPages.ga4Id} placeholder="G-XXXXXXXXXX" aria-invalid={!!form?.publicErrors?.ga4Id} />
			{#if form?.publicErrors?.ga4Id}<span class="error-text">✕ {form.publicErrors.ga4Id}</span>{/if}
			<span class="hint">Leave empty to turn analytics off.</span>
		</div>
		<div class="rows">
			<div class="row">
				<label for="pp-consent" class="ttext"><span class="tt">Cookie consent banner</span><span class="td">Analytics loads only after the visitor accepts</span></label>
				<span class="switch"><input id="pp-consent" type="checkbox" name="consentBanner" defaultChecked={data.publicPages.consent} /><span></span></span>
			</div>
		</div>
		<div class="field">
			<label class="label" for="pp-gsc">Google Search Console verification meta tag</label>
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
		<form method="POST" action="?/saveServer" class="block plain" use:enhance={saved('✓ Server settings saved')}>
			<div class="rows">
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
				<div class="row" id="species-care">
					<label for="sv-care" class="ttext"
						><span class="tt">Species care ranges</span><span class="td"
							>{care.off
								? 'Off: SPECIES_CARE=off is set.'
								: 'Temperature, pH and hardness ranges, adult size and schooling for the fish in the species list, from FishBase (CC BY-NC, so downloaded by this server, never bundled). Shown on Livestock, when adding livestock and in the AI summary, with warnings where a tank’s targets, a group’s size or a well-known conflict calls for a look.'}</span
						></label
					>
					<span class="switch"><input id="sv-care" type="checkbox" name="speciesCare" defaultChecked={care.on} disabled={care.off} /><span></span></span>
				</div>
			</div>
			<div class="actions"><button class="btn btn-primary">Save</button></div>
		</form>
		{#if stock}
			<form
				method="POST"
				action="?/stockLookAgain"
				class="block plain stock"
				use:enhance={() => {
					busy = 'stock';
					return async ({ update }) => {
						await update({ reset: false });
						busy = null;
					};
				}}
			>
				<div class="rows">
					<div class="row">
						<span class="ttext"
							><span class="tt">Species photos looked up</span><span class="td"
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
						<button class="btn" disabled={busy === 'stock'}>{busy === 'stock' ? 'Looking…' : 'Look again now'}</button>
					</div>
				</div>
				{#if stockResult}
					<p class="result {stockResult.ok ? 'ok' : 'bad'}" role="status">{stockResult.message}</p>
				{/if}
			</form>
		{/if}
		{#if care.on}
			<form
				method="POST"
				action="?/careDownload"
				class="block plain stock"
				use:enhance={() => {
					busy = 'care';
					return async ({ update }) => {
						await update({ reset: false });
						busy = null;
					};
				}}
			>
				<div class="rows">
					<div class="row">
						<span class="ttext"
							><span class="tt">Species care data</span><span class="td"
								>{care.have
									? `FishBase ${care.version} · ${care.count} of the bundled fish · downloaded ${new Date(care.fetchedAt ?? 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
									: care.downloading
										? 'Downloading now…'
										: 'Not downloaded yet. It needs internet access once; the server tries by itself, or press Download now.'}</span
							>{#if care.error}<span class="td">Last problem: <span class="mono">{care.error}</span></span>{/if}<span class="td"
								>Data © <a href={care.source.url} target="_blank" rel="noopener noreferrer">FishBase</a>, <a href={care.source.licenseUrl} target="_blank" rel="noopener noreferrer">{care.source.license}</a>: for non-commercial use.</span
							></span
						>
						<button class="btn" disabled={busy === 'care'}>{busy === 'care' ? 'Downloading…' : care.have ? 'Download again' : 'Download now'}</button>
					</div>
				</div>
				{#if careResult}
					<p class="result {careResult.ok ? 'ok' : 'bad'}" role="status">{careResult.message}</p>
				{/if}
			</form>
		{/if}
		<!-- the version: an accent box while an update is pending -->
		<div class="updbox" class:pending={!!data.app.update}>
			<span class="mb-text">
				<span class="mb-title">{data.app.update ? `↑ ${data.app.update.version} is available` : `Waterline v${data.server.version}`}</span>
				<span class="mb-sub">{data.app.update ? `You're on ${data.server.version}. Update the Docker image to get it; everything in /data is kept.` : 'Self-hosted · up to date'}</span>
			</span>
			{#if data.app.update}<a class="btn btn-primary" href="/settings/changelog#update">Update now</a>{/if}
			<a class="btn-text" href="/settings/changelog">What's new ›</a>
		</div>
	</section>

	<section class="sec" id="about" aria-labelledby="about-h">
		<div class="sec-head">
			<h2 id="about-h">Logs & version<SectionLink id="about" label="Logs & version" /></h2>
		</div>
		<div class="rows">
			<a class="row logs" href="/settings/server/logs">
				<span class="ttext"><span class="tt">Logs</span><span class="td">{logsLine}</span></span>
				{#if data.logs.error}<span class="state status-bad">✕ {data.logs.error}</span>{/if}
				<span class="chev" aria-hidden="true">›</span>
			</a>
		</div>
		<div class="stats">
			<div class="stat"><span class="sk">Version</span><span class="sv mono">{data.server.version}</span></div>
			<div class="stat"><span class="sk">Data folder</span><span class="sv mono">{data.server.data}</span></div>
			<div class="stat"><span class="sk">Users</span><span class="sv">{data.server.users}</span></div>
		</div>
	</section>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 22px;
		max-width: 820px;
	}
	.head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 10px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.admin {
		font-size: 10px;
		font-weight: 800;
		align-self: center;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
		margin-left: auto;
	}

	/* the parts: a grid of buttons, 1px lines between, the current one filled accent */
	.parts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		border-top: 1px solid var(--divider);
		border-left: 1px solid var(--divider);
	}
	.parts a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 44px;
		padding: 8px 12px;
		border-right: 1px solid var(--divider);
		border-bottom: 1px solid var(--divider);
		color: var(--text);
		font-size: 14px;
	}
	.parts a:hover {
		background: var(--surface);
	}
	.parts a.current {
		background: var(--accent);
		color: var(--on-accent);
		font-weight: 800;
	}
	.pb {
		font-size: 11px;
		font-weight: 800;
		white-space: nowrap;
		color: var(--accent-700);
	}
	.current .pb {
		color: var(--on-accent);
	}

	.sec {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.sec h2 {
		margin: 0;
		font-size: 22px;
	}
	.sec-head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sub {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.banner {
		margin: 0;
	}
	/* a part of a section: a 17px heading over a 2px ink rule */
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 12px;
		border-top: 2px solid var(--ink);
	}
	.block.plain {
		padding-top: 0;
		border-top: none;
	}
	.bhead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h3 {
		margin: 0;
		font-size: 17px;
	}
	.line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.state {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}
	/* "● On · Client …k2v9" */
	.status {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 10px 14px;
		background: var(--surface);
		font-size: 14px;
	}
	.status span {
		color: var(--text-2);
	}

	.field > .label {
		font-size: 13px;
	}
	.narrow {
		max-width: 420px;
	}
	.ga {
		max-width: 300px;
	}
	.input.mono {
		font-size: 14px;
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
	.uri-line {
		display: flex;
		gap: 8px;
	}
	.uri {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		padding: 8px 10px;
		background: var(--surface);
		border: 1px solid var(--divider);
		font-size: 12.5px;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.three {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.pair.host {
		grid-template-columns: minmax(0, 1fr) 120px;
	}
	.pair.domain {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
	}
	.segmented.provider,
	.segmented.region {
		align-self: flex-start;
	}
	.segmented.provider label {
		min-width: 110px;
		padding: 0 12px;
	}
	.segmented.region label {
		min-width: 56px;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.result {
		margin: 0;
		padding: 10px 14px;
		font-size: 14px;
		line-height: 1.4;
		border-left: 3px solid var(--ink);
		background: var(--surface);
	}
	.result.bad {
		background: var(--bad-bg);
		color: var(--bad-text);
		border-left-color: var(--accent);
	}
	.code {
		font-size: 12px;
	}
	/* "✓ Email is set up · Send test email", in a 2px ink box */
	.mailbox,
	.updbox {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 14px;
		padding: 12px 16px;
		border: 2px solid var(--ink);
	}
	.updbox {
		border-color: var(--divider);
	}
	.updbox.pending {
		border-color: var(--accent);
	}
	.mb-text {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.mb-title {
		font-weight: 800;
	}
	.mb-sub {
		font-size: 13px;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	/* rows: toggles and read-only settings, 1px dividers */
	.rows {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 56px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.ttext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	label.ttext,
	.choice {
		cursor: pointer;
	}
	.tt {
		font-size: 15px;
		font-weight: 600;
	}
	.td {
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.choice .radio {
		width: 20px;
		height: 20px;
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
	.logs .chev {
		font-size: 18px;
		color: var(--neutral-600);
	}
	@media (hover: hover) {
		.logs:hover {
			background: var(--surface);
		}
	}
	/* version, data folder, users */
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 2px solid var(--ink);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px;
		min-width: 0;
	}
	.stat + .stat {
		border-left: 1px solid var(--divider);
	}
	.stat:first-child {
		padding-left: 0;
	}
	.sk {
		font-size: 12px;
		color: var(--text-muted);
	}
	.sv {
		font-size: 18px;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	/* a shared link lands on the heading, not under the header */
	.sec,
	.block,
	#analytics,
	#species-photos {
		scroll-margin-top: 16px;
	}

	/* phones: fields one under the other */
	@media (max-width: 1023px) {
		.three,
		.pair,
		.pair.host,
		.pair.domain {
			grid-template-columns: 1fr;
		}
		.pair.host {
			grid-template-columns: minmax(0, 1fr) 100px;
		}
		.actions .btn {
			flex: 1;
		}
		.stats {
			grid-template-columns: 1fr;
		}
		.stat + .stat {
			border-left: none;
			border-top: 1px solid var(--divider);
		}
		.stat {
			padding: 10px 0;
		}
	}
	@media (min-width: 1024px) {
		.page {
			gap: 28px;
		}
		h1 {
			font-size: 22px;
		}
		.sec {
			gap: 16px;
		}
	}
</style>
