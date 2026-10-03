<script lang="ts">
	// A shared photo (D8's public link, S2's look). Everything lines up with the
	// photo: logo, image and caption share one column as wide as the image.
	import Logo from '$lib/components/Logo.svelte';
	import PublicAnalytics from '$lib/components/PublicAnalytics.svelte';
	import PublicHead from '$lib/components/PublicHead.svelte';
	let { data } = $props();
	const s = $derived(data.share);
	const ratio = $derived(s.width && s.height ? s.width / s.height : 4 / 3);
</script>

<PublicHead seo={data.seo} />

<div class="share">
	<div class="col" style:--ratio={ratio}>
		<header><a href="/" aria-label="Waterline"><Logo size={24} wordmark wordSize={17} /></a></header>
		<main>
			<img src="/s/{s.id}/image" width={s.width} height={s.height} alt={s.title ?? 'Aquarium photo'} />
			{#if s.title || s.tankName || s.date || s.note}
				<div class="cap">
					{#if s.title}<h1>{s.title}</h1>{/if}
					{#if s.tankName || s.date}
						<p class="meta">
							{#if s.tankName}{#if s.tankSlug}<a href="/t/{s.tankSlug}">{s.tankName}</a>{:else}{s.tankName}{/if}{/if}{s.tankName && s.date ? ' · ' : ''}{s.date ?? ''}
						</p>
					{/if}
					{#if s.note}<p class="note">{s.note}</p>{/if}
				</div>
			{/if}
		</main>
		<footer>Shared with Waterline</footer>
	</div>
</div>

<PublicAnalytics ga4Id={data.analytics.ga4Id} consent={data.analytics.consent} />

<style>
	.share {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
		padding: 0 16px calc(24px + env(safe-area-inset-bottom));
	}
	/* as wide as the photo when it fits the screen height, never too narrow for the caption */
	.col {
		--photo-h: calc(100dvh - 240px);
		width: min(100%, max(min(100%, 420px), calc(var(--photo-h) * var(--ratio))));
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		min-height: 60px;
		padding-top: env(safe-area-inset-top);
	}
	header a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	main {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: max(var(--photo-h), 240px);
		object-fit: contain;
		border-radius: 0;
		/* letterboxing, if the photo is taller than the screen allows */
		background: var(--viewer-bg);
	}
	.cap {
		padding: 12px 0 0;
		border-top: 2px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.meta {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.meta a {
		font-weight: 800;
		padding: 12px 0; /* taller tap target; inline, so the line doesn't move */
	}
	.note {
		margin: 6px 0 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-2);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	footer {
		margin-top: 16px;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
		font-size: 13px;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.share {
			padding-inline: 40px;
		}
		header {
			min-height: 68px;
		}
		h1 {
			font-size: 26px;
		}
	}
</style>
