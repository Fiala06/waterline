<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<link rel="canonical" href={data.seo.canonical} />
</svelte:head>

<div class="home">
	<!-- same header as the public tank pages (P3) -->
	<header class="top">
		<div class="top-in">
			<span class="brand"><Logo size={24} wordmark wordSize={16} /></span>
			<a class="btn signin" href="/signin">Sign in</a>
		</div>
	</header>
	<main>
		<div class="head"><span class="kicker">Public tanks</span><h1>Aquariums on {data.host}</h1></div>
		{#if !data.tanks.length}<p class="muted">No public tanks yet.</p>{/if}
		<div class="grid">
			{#each data.tanks as t (t.slug)}
				<a class="tank" href="/t/{t.slug}">
					<span class="cover" class:photo-placeholder={!t.cover}>{#if t.cover}<img src="/p/{t.slug}/{t.cover}?size=thumb" alt="" loading="lazy" />{/if}</span>
					<span class="info">
						<strong>{t.name}</strong>
						<span class="muted">{[t.type, t.volume, t.keeper ? `by ${t.keeper}` : null].filter(Boolean).join(' · ')}</span>
					</span>
				</a>
			{/each}
		</div>
	</main>
</div>

<style>
	.home {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}
	.top {
		border-bottom: 2px solid var(--divider);
		padding-top: env(safe-area-inset-top);
	}
	.top-in {
		max-width: 1280px;
		margin: 0 auto;
		min-height: 56px;
		padding: 0 20px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.brand {
		display: inline-flex;
	}
	.signin {
		min-height: 36px;
		padding: 0 14px;
		font-size: 13px;
	}
	main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 24px 20px calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 12px;
		border-bottom: 2px solid var(--ink);
	}
	h1 {
		font-size: 30px;
		margin: 0;
	}
	.muted {
		margin: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 20px 16px;
	}
	.tank {
		color: var(--text);
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
		padding-top: 10px;
	}
	@media (hover: hover) {
		.tank:hover {
			color: var(--text);
		}
		.tank:hover strong {
			color: var(--accent-text);
		}
	}
	.cover {
		height: 150px;
		border: none;
		display: block;
		background-color: var(--surface);
	}
	.cover img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.info {
		padding: 10px 0 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}
	.info strong {
		font-size: 17px;
		font-weight: 800;
	}
	@media (min-width: 1024px) {
		.top-in {
			min-height: 60px;
			padding: 0 40px;
		}
		main {
			padding: 32px 40px 48px;
		}
		h1 {
			font-size: 42px;
		}
	}
</style>
