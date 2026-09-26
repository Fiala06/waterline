<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	let { data } = $props();
	const s = $derived(data.share);
</script>

<PublicHead seo={data.seo} />

<div class="share">
	<header><a href="/" aria-label="Waterline"><Logo size={24} wordmark wordSize={17} /></a></header>
	<main>
		<img src="/s/{s.id}/image" width={s.width} height={s.height} alt={s.title ?? 'Aquarium photo'} />
		{#if s.title || s.tankName || s.date}
			<div class="card cap">
				{#if s.title}<h1>{s.title}</h1>{/if}
				{#if s.tankName || s.date}
					<p class="muted">
						{#if s.tankName}{#if s.tankSlug}<a href="/t/{s.tankSlug}">{s.tankName}</a>{:else}{s.tankName}{/if}{/if}{s.tankName && s.date ? ' · ' : ''}{s.date ?? ''}
					</p>
				{/if}
				{#if s.note}<p class="note">{s.note}</p>{/if}
			</div>
		{/if}
		<p class="muted sm">Shared with Waterline</p>
	</main>
</div>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.share {
		min-height: 100dvh;
		background: #030809;
		color: #e6f0f0;
		--text: #e6f0f0;
	}
	header {
		padding: 14px 20px;
	}
	main {
		max-width: 1000px;
		margin: 0 auto;
		padding: 0 16px 32px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: center;
	}
	img {
		max-width: 100%;
		max-height: 75dvh;
		height: auto;
		width: auto;
		border-radius: 12px;
	}
	.cap {
		width: 100%;
		max-width: 640px;
		padding: 16px;
		background: #13262c;
		border-color: #24414a;
		color: #e6f0f0;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 19px;
	}
	.cap p {
		margin: 0;
		color: #9fb4b8;
	}
	.note {
		margin-top: 8px !important;
		color: #b8cacd !important;
		line-height: 1.5;
	}
	.sm {
		font-size: 13px;
		color: #7d9397;
	}
</style>
