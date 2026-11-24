<script lang="ts">
	// The product homepage (#300): headline, a phone screenshot of the demo
	// account (synthetic data), what it does, this server, and running your own.
	import CategoryIcon from '$lib/components/CategoryIcon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	import { onMount } from 'svelte';
	let { data } = $props();
	// signed out (a revoked session lands here, not on sign-in): forget what's kept offline for the last person (#336)
	onMount(() => {
		if (!data.signedIn) navigator.serviceWorker?.controller?.postMessage('clear-user-cache');
	});
	const features = [
		{ icon: 'test', title: 'Water tests and trends', text: 'Log a test in seconds and see each reading against its target, with charts that show where it’s heading.' },
		{ icon: 'water_change', title: 'Reminders that fit your tank', text: 'Water changes, filter cleans, dosing and feeding, by email, push or just on the dashboard, snoozed or skipped when life happens.' },
		{ icon: 'note', title: 'A journal of everything', text: 'Water changes, maintenance, livestock, plants and photos in one History you can search, so you can see what changed when.' },
		{ icon: 'expense', title: 'Spending, with receipts', text: 'What each tank costs, by month and category, with a photo of the receipt and a spreadsheet when you want one.' }
	] as const;
</script>

<PublicHead seo={data.seo} />

<div class="welcome">
	<header class="top">
		<div class="top-in">
			<a class="brand" href="/welcome" aria-label="Waterline home"><Logo size={24} wordmark wordSize={16} /></a>
			<a class="btn signin" href={data.signedIn ? '/' : '/signin'}>{data.signedIn ? 'Open Waterline' : 'Sign in'}</a>
		</div>
	</header>

	<main>
		<section class="hero" aria-labelledby="hero-h">
			<div class="pitch">
				<span class="kicker">Aquarium log · freshwater first</span>
				<h1 id="hero-h">Know what your tank is doing.</h1>
				<p class="lede">Waterline keeps your water tests, water changes, maintenance and costs in one place, and reminds you what’s due. It works on your phone at the tank, even offline.</p>
				<div class="ctas">
					<a class="btn btn-primary" href={data.signedIn ? '/' : '/signin'}>{data.signedIn ? 'Open Waterline' : 'Sign in'}</a>
					{#if data.publicTanks}<a class="btn" href="/public">See tanks on {data.host}</a>{/if}
					<a class="btn" href={data.repo} rel="noopener">Self-host it ↗</a>
				</div>
				{#if data.access}<p class="access">{data.access}</p>{/if}
			</div>
			<figure class="shot">
				<picture>
					<source srcset="/screenshots/phone-dashboard-dark.png" media="(prefers-color-scheme: dark)" />
					<img
						src="/screenshots/phone-dashboard-light.png"
						width="390"
						height="844"
						alt="Waterline on a phone: a planted tank’s nitrate is high, iron and KH are near low, and its water change is due."
					/>
				</picture>
				<figcaption>The demo account, with made-up tanks.</figcaption>
			</figure>
		</section>

		<section class="features" aria-labelledby="what-h">
			<h2 id="what-h" class="kicker rule">What it does</h2>
			<ul>
				{#each features as f (f.title)}
					<li>
						<CategoryIcon kind={f.icon} size={44} />
						<div>
							<h3>{f.title}</h3>
							<p>{f.text}</p>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<div class="ways">
			<section aria-labelledby="here-h">
				<h2 id="here-h" class="kicker rule">On {data.host}</h2>
				<p>This is a Waterline server run by its owner. Sign in to keep your tanks here: they're private unless you share or publish them.</p>
				{#if data.access}<p class="access">{data.access}</p>{/if}
				<a class="btn btn-primary" href={data.signedIn ? '/' : '/signin'}>{data.signedIn ? 'Open Waterline' : 'Sign in'}</a>
			</section>
			<section aria-labelledby="own-h">
				<h2 id="own-h" class="kicker rule">Run your own</h2>
				<p>Waterline is free, open-source software (MIT). Run it on your own server with Docker and your data stays with you.</p>
				<a class="btn" href={data.repo} rel="noopener">Waterline on GitHub ↗</a>
			</section>
		</div>
		<!-- who runs this server, what it keeps, and where to get help (#302) -->
		<p class="foot"><a href="/about">About this server · privacy &amp; help</a></p>
	</main>
</div>

<style>
	.welcome {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}
	.top {
		border-bottom: 2px solid var(--ink);
	}
	.top-in,
	main {
		max-width: 1080px;
		margin: 0 auto;
		padding-inline: 16px;
	}
	.top-in {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 60px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--text);
	}
	.btn {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	main {
		display: flex;
		flex-direction: column;
		gap: 48px;
		padding-block: 32px 64px;
	}
	.hero {
		display: grid;
		gap: 32px;
	}
	.pitch {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: 40px;
		line-height: 1.05;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.lede {
		margin: 0;
		font-size: 18px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.access {
		margin: 0;
		padding-left: 12px;
		border-left: 2px solid var(--ink);
		font-size: 15px;
		line-height: 1.5;
	}
	.shot {
		margin: 0;
		justify-self: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.shot img {
		display: block;
		width: min(300px, 80vw);
		height: auto;
		border: 2px solid var(--ink);
	}
	figcaption {
		font-size: 12px;
		color: var(--text-muted);
	}
	.rule {
		display: block;
		align-self: stretch;
		margin: 0 0 4px;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.features ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.features li {
		display: flex;
		gap: 16px;
		padding: 16px 0;
		border-bottom: 1px solid var(--divider);
	}
	h3 {
		margin: 0 0 4px;
		font-size: 17px;
	}
	.features p,
	.ways p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.ways {
		display: grid;
		gap: 32px;
	}
	.ways section {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.foot {
		margin: 0;
		padding-top: 16px;
		border-top: 1px solid var(--divider);
		font-size: 14px;
	}
	.foot a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		text-decoration: underline;
	}
	@media (min-width: 1024px) {
		.top-in,
		main {
			padding-inline: 32px;
		}
		.hero {
			grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
			align-items: center;
		}
		h1 {
			font-size: 64px;
		}
		.features ul {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: 32px;
		}
		.ways {
			grid-template-columns: 1fr 1fr;
		}
		.ways section + section {
			border-left: 2px solid var(--divider);
			padding-left: 32px;
		}
	}
</style>
