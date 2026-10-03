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
		<h1>Aquariums on {data.host}</h1>
		{#if !data.tanks.length}<p class="muted">No public tanks yet.</p>{/if}
		<div class="grid">
			{#each data.tanks as t (t.slug)}
				<a class="card tank" href="/t/{t.slug}">
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
		border-bottom: 1px solid var(--border);
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
		position: relative;
		min-height: 36px;
		padding: 0 14px;
		border-radius: 0;
		font-size: 14px;
	}
	.signin::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 24px 20px calc(40px + env(safe-area-inset-bottom));
	}
	h1 {
		font-size: 28px;
		font-weight: 600;
		margin: 0 0 16px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
	}
	.tank {
		overflow: hidden;
		color: var(--text);
		display: flex;
		flex-direction: column;
	}
	@media (hover: hover) {
		.tank:hover {
			color: var(--text);
			border-color: var(--border-strong);
		}
	}
	.cover {
		height: 150px;
		border: none;
		display: block;
		background-color: var(--surface-hi);
	}
	.cover img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.info {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 14px;
	}
	.info strong {
		font-size: 17px;
		font-weight: 600;
	}
	@media (min-width: 1024px) {
		.top-in {
			min-height: 60px;
			padding: 0 40px;
		}
		main {
			padding: 32px 40px 48px;
		}
	}
</style>
