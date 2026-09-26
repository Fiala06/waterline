<script lang="ts">
	// Success toast, e.g. "✓ Saved 7 readings · 1 out of range". Auto-hides after 2.8s.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	let {
		message,
		undo,
		raised = false
	}: { message: string | null | undefined; undo?: string; raised?: boolean } = $props();
	let visible = $state<string | null>(null);

	$effect(() => {
		if (!message) return;
		visible = message;
		const t = setTimeout(() => (visible = null), undo ? 6000 : 2800);
		return () => clearTimeout(t);
	});
</script>

<div class="toast-region" class:raised role="status" aria-live="polite">
	{#if visible}
		<div class="toast">
			<span>{visible}</span>
			{#if undo}
				<form method="POST" action="/tasks?/undo" use:enhance>
					<input type="hidden" name="completionId" value={undo} />
					<input type="hidden" name="from" value={page.url.pathname + page.url.search} />
					<button class="undo">Undo</button>
				</form>
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
	.toast-region.raised {
		bottom: calc(184px + env(safe-area-inset-bottom));
	}
	.toast {
		width: 100%;
		max-width: 480px;
		background: var(--toast-bg);
		color: var(--toast-text);
		border-radius: 14px;
		padding: 14px 16px;
		font-size: 15px;
		font-weight: 600;
		box-shadow: var(--shadow-toast);
		animation: wl-fade 0.2s ease-out;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		pointer-events: auto;
	}
	.undo {
		color: var(--toast-action);
		font-weight: 700;
		min-height: 32px;
		padding: 0 4px;
	}
	@media (min-width: 900px) {
		.toast-region,
		.toast-region.raised {
			left: auto;
			right: 28px;
			bottom: 28px;
			width: 400px;
		}
	}
</style>
