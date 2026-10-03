<script lang="ts">
	// Bottom sheet on phones (a 2px ink top rule, a 44×4 grabber, a 45% scrim);
	// a centred dialog on desktop (a 2px ink border and shadow-lg, scrolling
	// inside). Built on <dialog> for focus trapping, Esc to close and an inert
	// background.
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		label,
		width = 560,
		headerExtra,
		children
	}: {
		open?: boolean;
		title?: string;
		label?: string;
		width?: number;
		headerExtra?: Snippet;
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	style:--w="{width}px"
	aria-label={label ?? title}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	<div class="panel">
		<div class="handle" aria-hidden="true"></div>
		{#if title}
			<div class="head">
				<h2>{title}</h2>
				{@render headerExtra?.()}
				<button type="button" class="cancel" onclick={() => (open = false)}>Cancel</button>
			</div>
		{/if}
		{@render children()}
	</div>
</dialog>

<style>
	.sheet {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text);
		max-width: none;
		max-height: none;
		width: 100%;
		height: 100%;
		margin: 0;
		display: flex;
		align-items: flex-end;
	}
	.sheet:not([open]) {
		display: none;
	}
	.sheet::backdrop {
		background: var(--scrim);
		animation: wl-fade 0.2s ease-out;
	}
	.panel {
		width: 100%;
		max-height: 92dvh;
		overflow-y: auto;
		background: var(--bg);
		border-top: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		padding: 8px 20px calc(28px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 16px;
		animation: wl-slide-up 0.25s ease-out;
	}
	.handle {
		width: 44px;
		height: 4px;
		background: var(--neutral-400);
		align-self: center;
		flex-shrink: 0;
		margin-bottom: -4px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.head h2 {
		margin: 0;
		font-size: 22px;
		flex: 1;
	}
	.cancel {
		font-size: 14px;
		font-weight: 800;
		color: var(--accent-text);
		min-height: 44px;
		padding: 0 4px;
	}
	/* the shell's breakpoint: phones and tablets get the bottom sheet */
	@media (min-width: 1024px) {
		.sheet {
			align-items: center;
			justify-content: center;
		}
		.panel {
			width: min(var(--w), calc(100vw - 48px));
			max-height: calc(100vh - 32px);
			border: 2px solid var(--ink);
			padding: 22px 24px 24px;
			animation: wl-fade 0.15s ease-out;
		}
		.handle {
			display: none;
		}
	}
</style>
