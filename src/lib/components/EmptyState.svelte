<script lang="ts">
	// 7.8 · Empty state: dashed card, category icon, title, one line of help and
	// an optional action. `compact` for side columns and narrow panes.
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
		border-radius: 18px;
		background: var(--surface);
		border: 1px dashed var(--border-strong);
		padding: 22px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.compact {
		padding: 18px;
		gap: 12px;
	}
	.compact h2 {
		font-size: 16px;
	}
	/* Tanks have no category icon: a tank outline on the same tile. */
	.tank-icon {
		width: 44px;
		height: 44px;
		border-radius: 13px;
		background: var(--selected);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.tank-icon i {
		width: 18px;
		height: 14px;
		border: 2.5px solid var(--accent);
		border-radius: 3px;
	}
</style>
