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
	<header>
		<Logo size={28} wordmark wordSize={20} />
		<a class="btn" href="/signin">Sign in</a>
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
		max-width: 1000px;
		margin: 0 auto;
		padding: 16px 20px 40px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 24px;
	}
	h1 {
		font-size: 28px;
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
	.cover {
		height: 150px;
		border: none;
		display: block;
	}
	.cover img {
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
	}
</style>
