<script lang="ts">
	// About this server (#302): who runs it, what it keeps, what it shares and
	// with whom, your data, the admin's terms, and how to get help.
	import Logo from '$lib/components/Logo.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>About this server · {data.host} · Waterline</title>
	<meta name="description" content="Who runs this Waterline server, what it keeps, the services it uses, and how to get help." />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="about">
	<header class="top">
		<div class="top-in">
			<a class="brand" href={data.signedIn ? '/' : '/signin'} aria-label="Waterline"><Logo size={24} wordmark wordSize={16} /></a>
			<a class="btn" href={data.signedIn ? '/' : '/signin'}>{data.signedIn ? 'Back to Waterline' : 'Sign in'}</a>
		</div>
	</header>
	<main>
		<div class="head">
			<span class="kicker">{data.host}</span>
			<h1>About this server</h1>
			<p class="lede">
				Waterline is software anyone can run. This page is about this server: who runs it, what it keeps and which services it uses, as it's set up now.
			</p>
		</div>

		<section aria-labelledby="who-h">
			<h2 id="who-h" class="kicker rule">Who runs it</h2>
			<p>{data.operator ?? 'This server is run by its owner, who decides who can use it.'}</p>
			{#if data.access}<p>{data.access}</p>{/if}
			{#if data.contact}<p>Questions about your account, privacy or security: <a href="mailto:{data.contact}">{data.contact}</a></p>{/if}
		</section>

		<section aria-labelledby="keep-h">
			<h2 id="keep-h" class="kicker rule">What it keeps</h2>
			<ul class="list">
				<li>What you log for your tanks: water tests, History, tasks, livestock, plants, equipment and spending.</li>
				<li>The photos and receipts you add. Photos are stored without their camera details (no location); the date taken is kept.</li>
				<li>Your name, email address, settings, and a record of what the server does for troubleshooting, kept 30 days.</li>
			</ul>
		</section>

		<section aria-labelledby="private-h">
			<h2 id="private-h" class="kicker rule">Private unless you share it</h2>
			<ul class="list">
				<li>Your tanks are yours: nobody else on this server sees them.</li>
				<li>You can share a tank with someone by email, so they can log to it or only view it, and stop sharing at any time.</li>
				{#if data.publicPages}<li>A public page or photo link exists only when you publish one, showing only what you pick.</li>{/if}
				<li>Waterline's admin screens show who has an account, not anyone's tanks. Whoever runs the server can reach its files and database, as with any hosted service.</li>
			</ul>
		</section>

		<section aria-labelledby="services-h">
			<h2 id="services-h" class="kicker rule">Services this server uses</h2>
			<ul class="list svc">
				{#each data.services as s (s.name)}
					<li><b>{s.name}</b><span>{s.what}</span></li>
				{/each}
			</ul>
		</section>

		<section aria-labelledby="data-h">
			<h2 id="data-h" class="kicker rule">Your data</h2>
			<ul class="list">
				<li>Download a full backup of your tanks, photos and receipts at any time in Settings › Import &amp; export.</li>
				<li>Delete your account in Settings › Data: your tanks, photos, receipts and backups go with it.</li>
			</ul>
		</section>

		{#if data.termsParagraphs.length}
			<section aria-labelledby="terms-h">
				<h2 id="terms-h" class="kicker rule">Terms and retention</h2>
				{#each data.termsParagraphs as p, i (i)}<p class="terms">{p}</p>{/each}
				{#if data.updated}<p class="meta">Last changed {data.updated}</p>{/if}
			</section>
		{/if}

		<section aria-labelledby="help-h">
			<h2 id="help-h" class="kicker rule">Get help or report a problem</h2>
			{#if data.contact}<p>Account, privacy or security: email <a href="mailto:{data.contact}">{data.contact}</a>.</p>{/if}
			<p>
				Bugs in Waterline itself: <a href="{data.repo}/issues" rel="noopener">GitHub issues ↗</a>. Those are public, so never include private links, tokens, photos, receipts or
				account details there.
			</p>
			<p>A security hole in Waterline: see its <a href="{data.repo}/blob/main/SECURITY.md" rel="noopener">security policy ↗</a>.</p>
		</section>
	</main>
</div>

<style>
	.about {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}
	.top {
		border-bottom: 2px solid var(--ink);
	}
	.top-in,
	main {
		max-width: 720px;
		margin: 0 auto;
		padding-inline: 16px;
	}
	.top-in {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 60px;
	}
	.brand,
	.btn {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.brand {
		color: var(--text);
	}
	main {
		display: flex;
		flex-direction: column;
		gap: 32px;
		padding-block: 32px 64px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		margin: 0;
		font-size: 36px;
	}
	.lede,
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
	}
	.lede,
	.meta {
		color: var(--text-muted);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.rule {
		display: block;
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
		line-height: 1.5;
	}
	.svc li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.svc span {
		color: var(--text-muted);
	}
	.terms {
		white-space: pre-line;
	}
	main a {
		text-decoration: underline;
	}
	@media (min-width: 1024px) {
		.top-in,
		main {
			padding-inline: 32px;
		}
		h1 {
			font-size: 48px;
		}
	}
</style>
