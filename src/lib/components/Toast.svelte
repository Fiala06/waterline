<script lang="ts">
	// The toast (redesign README → Global overlays): bottom-centre, ink
	// background. "✓ Saved 7 readings · 1 out of range" hides after 2.8s; one
	// with Undo or View ("… · Undo") stays about 6s, and Esc dismisses it.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ToastUndo } from '$lib/ui.svelte';
	let {
		message,
		undo,
		view,
		lift = 'none'
	}: {
		message: string | null | undefined;
		undo?: ToastUndo;
		view?: string;
		/** On phones, sit above the tab bar, or above the tab bar and the + button. */
		lift?: 'none' | 'tabs' | 'fab';
	} = $props();
	let visible = $state<string | null>(null);

	$effect(() => {
		if (!message) return;
		visible = message;
		const t = setTimeout(() => (visible = null), undo || view ? 6000 : 2800);
		return () => clearTimeout(t);
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && visible && (undo || view)) visible = null;
	}}
/>

<div class="toast-region {lift}" role="status" aria-live="polite">
	{#if visible}
		<div class="toast">
			<span class="msg">{visible}</span>
			{#if undo}
				<span class="sep" aria-hidden="true">·</span>
				<form method="POST" action={undo.action} use:enhance>
					<input type="hidden" name={undo.name} value={undo.value} />
					<input type="hidden" name="from" value={page.url.pathname + page.url.search} />
					<button class="undo">Undo</button>
				</form>
			{:else if view}
				<span class="sep" aria-hidden="true">·</span>
				<a class="undo" href={view} onclick={() => (visible = null)}>View</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toast-region {
		position: fixed;
		left: 20px;
		right: 20px;
		bottom: calc(24px + env(safe-area-inset-bottom));
		z-index: 60;
		pointer-events: none;
		display: flex;
		justify-content: center;
	}
	.toast-region.tabs {
		bottom: calc(104px + env(safe-area-inset-bottom));
	}
	.toast-region.fab {
		bottom: calc(184px + env(safe-area-inset-bottom));
	}
	.toast {
		max-width: 560px;
		min-height: 48px;
		background: var(--toast-bg);
		color: var(--toast-text);
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 700;
		box-shadow: var(--shadow-lg);
		animation: wl-fade 0.2s ease-out;
		display: flex;
		align-items: center;
		gap: 8px;
		pointer-events: auto;
	}
	.msg {
		min-width: 0;
	}
	.sep {
		opacity: 0.6;
	}
	.undo {
		color: var(--toast-action);
		font-weight: 800;
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0 4px;
		white-space: nowrap;
	}
	/* the shell's breakpoint: below it the tab bar is still showing */
	@media (min-width: 1024px) {
		.toast-region,
		.toast-region.tabs,
		.toast-region.fab {
			bottom: 28px;
		}
	}
</style>
