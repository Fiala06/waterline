<script lang="ts">
	// Empty state (redesign: no boxes): a category icon tile, a title, one line
	// of help and an optional action, sitting under the section's rule.
	// `compact` for side columns and narrow panes.
	import type { Snippet } from 'svelte';
	import CategoryIcon, { type Kind as IconKind } from './CategoryIcon.svelte';

	type Kind = IconKind | 'tank';
	let {
		icon = 'note',
		title,
		text,
		href,
		label,
		primary = false,
		compact = false,
		children
	}: {
		icon?: Kind;
		title: string;
		text?: string;
		/** Action link; use `children` for anything else (a form, two buttons). */
		href?: string;
		label?: string;
		primary?: boolean;
		compact?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div class="empty" class:compact>
	{#if icon === 'tank'}
		<span class="tank-icon" aria-hidden="true"><i></i></span>
	{:else}
		<CategoryIcon kind={icon} size={44} />
	{/if}
	<div class="text">
		<h2>{title}</h2>
		{#if text}<p>{text}</p>{/if}
	</div>
	{#if href && label}
		<a class="btn" class:btn-primary={primary} {href}>{label}</a>
	{/if}
	{@render children?.()}
</div>

<style>
	.empty {
		padding: 20px 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	.empty :global(.icon) {
		border-radius: 0 !important;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.compact {
		padding: 16px 0;
		gap: 12px;
	}
	.compact h2 {
		font-size: 16px;
	}
	/* Tanks have no category icon: a tank outline on the same tile. */
	.tank-icon {
		width: 44px;
		height: 44px;
		background: var(--surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tank-icon i {
		width: 18px;
		height: 14px;
		border: 2.5px solid var(--ink);
	}
</style>
