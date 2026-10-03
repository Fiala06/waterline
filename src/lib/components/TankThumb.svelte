<script lang="ts">
	// Tank cover photo, or the striped placeholder when there isn't one. Square
	// (the redesign has no radius); `radius` is kept for callers that pass 0.
	import { photoUrl } from '$lib/media';
	let { cover = null, size = 44, radius = 0 }: { cover?: string | null; size?: number; radius?: number } = $props();
</script>

<span class="thumb" class:photo-placeholder={!cover} style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px">
	{#if cover}<img src={photoUrl(cover)} alt="" />{/if}
</span>

<style>
	.thumb {
		display: block;
		flex-shrink: 0;
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
