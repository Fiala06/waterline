<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { photoUrl } from '$lib/media';
	let { data } = $props();

	function onkeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea, [popover]:popover-open')) return;
		if (e.key === 'ArrowLeft' && data.prev) goto(`/photos/${data.prev}`, { replaceState: true });
		if (e.key === 'ArrowRight' && data.next) goto(`/photos/${data.next}`, { replaceState: true });
		if (e.key === 'Escape') goto('/photos');
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Photo {data.position} · Waterline</title></svelte:head>

<div class="viewer">
	<div class="bar">
		<a class="round" href="/photos" aria-label="Close">✕</a>
		<span class="pos">{data.position}</span>
		<span class="round spacer" aria-hidden="true"></span>
	</div>

	<div class="stage">
		{#if data.prev}<a class="nav prev" href="/photos/{data.prev}" data-sveltekit-replacestate aria-label="Previous photo">‹</a>{/if}
		<img
			src={photoUrl(data.photo.id, 'full')}
			width={data.photo.width}
			height={data.photo.height}
			alt={data.entry?.title ?? 'Tank photo'}
		/>
		{#if data.next}<a class="nav next" href="/photos/{data.next}" data-sveltekit-replacestate aria-label="Next photo">›</a>{/if}
	</div>

	<div class="card info">
		<div class="muted sm">{data.when}</div>
		{#if data.entry?.title}<div class="title">{data.entry.title}</div>{/if}
		{#if data.entry?.note}<p class="note">{data.entry.note}</p>{/if}
		{#if data.entry}<a class="link" href={data.entry.href}>View entry ›</a>{/if}
		<div class="actions">
			<a class="btn" href="{photoUrl(data.photo.id, 'full')}?download" download>Download</a>
			{#if data.photo.isCover}
				<span class="btn is-cover" aria-disabled="true">✓ Tank cover</span>
			{:else}
				<form method="POST" action="?/cover" use:enhance><button class="btn">Set as cover</button></form>
			{/if}
			<ConfirmDelete id="confirm-photo" title="Delete this photo?" body="The photo is removed from its entry. This can't be undone." />
		</div>
	</div>
</div>

<style>
	.viewer {
		min-height: 100dvh;
		background: #030809;
		color: #e6f0f0;
		display: flex;
		flex-direction: column;
		padding-bottom: calc(24px + env(safe-area-inset-bottom));
	}
	.bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 20px;
	}
	.round {
		width: 44px;
		height: 44px;
		border-radius: 22px;
		background: #13262c;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #9fb4b8;
		font-size: 18px;
	}
	.spacer {
		visibility: hidden;
	}
	.pos {
		font-size: 15px;
		font-weight: 600;
	}
	.stage {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}
	.stage img {
		max-width: 100%;
		max-height: 70dvh;
		width: auto;
		height: auto;
		display: block;
	}
	.nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 48px;
		height: 48px;
		border-radius: 24px;
		background: rgba(19, 38, 44, 0.8);
		color: #e6f0f0;
		font-size: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.prev {
		left: 12px;
	}
	.next {
		right: 12px;
	}
	.info {
		margin: 16px 16px 0;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: #13262c;
		border-color: #24414a;
		color: #e6f0f0;
		max-width: 560px;
		align-self: stretch;
	}
	.sm {
		font-size: 13px;
		color: #9fb4b8;
	}
	.title {
		font-size: 17px;
		font-weight: 600;
	}
	.note {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: #b8cacd;
	}
	.link {
		font-size: 14px;
		font-weight: 600;
		padding-top: 4px;
		color: #4fc4bd;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 10px;
	}
	.actions .btn,
	.actions :global(.btn) {
		color: #e6f0f0;
		border-color: #2f525c;
	}
	.actions :global(.btn-danger) {
		color: #f08a78;
		border-color: #6b3129;
		flex: none;
	}
	.is-cover {
		opacity: 0.7;
	}
	@media (min-width: 1024px) {
		.viewer {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 360px;
			grid-template-rows: auto 1fr;
			padding: 0;
		}
		.bar {
			grid-column: 1 / -1;
		}
		.stage img {
			max-height: calc(100dvh - 100px);
		}
		.info {
			margin: 0 24px 24px 0;
			align-self: start;
		}
	}
</style>
