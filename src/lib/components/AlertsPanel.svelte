<script lang="ts">
	import { dropFocus } from '$lib/ui.svelte';
	// The alerts panel, from the bell: out-of-range readings, overdue tasks and an
	// update notice, each opening its page. What's been seen is kept on this device.
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';

	export interface Alert {
		key: string;
		kind: 'task' | 'reading' | 'update';
		title: string;
		sub: string;
		href: string;
	}
	let {
		open = $bindable(false),
		alerts,
		onread
	}: {
		open?: boolean;
		alerts: Alert[];
		/** the alert keys that were just marked read */
		onread: (keys: string[]) => void;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let first: HTMLElement | undefined = $state();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			tick().then(() => first?.focus());
		}
		if (!open && dialog.open) dialog.close();
	});
	const glyph = (a: Alert) => (a.kind === 'update' ? '↑' : '✕');
</script>

<dialog
	bind:this={dialog}
	class="alerts"
	aria-label="Alerts"
	onclose={() => {
		open = false;
		dropFocus(dialog);
	}}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	{#if open}
	<div class="panel">
		<div class="head">
			<h2>Alerts{#if alerts.length}<span class="count">{alerts.length}</span>{/if}</h2>
			{#if alerts.length}
				<button
					type="button"
					class="btn-text"
					bind:this={first}
					onclick={() => {
						onread(alerts.map((a) => a.key));
						open = false;
					}}>Mark all read</button
				>
			{:else}
				<button type="button" class="btn-text" bind:this={first} onclick={() => (open = false)}>Close</button>
			{/if}
		</div>
		{#if alerts.length}
			<ul>
				{#each alerts as a (a.key)}
					<li>
						<button
							type="button"
							class="row"
							onclick={() => {
								onread([a.key]);
								open = false;
								goto(a.href);
							}}
						>
							<span class="g" class:up={a.kind === 'update'} aria-hidden="true">{glyph(a)}</span>
							<span class="text"><span class="title">{a.title}</span><span class="sub">{a.sub}</span></span>
							<span class="chev" aria-hidden="true">›</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="none">Nothing needs attention. Readings out of range and overdue tasks show up here.</p>
		{/if}
	</div>
	{/if}
</dialog>

<style>
	.alerts {
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
	.alerts:not([open]) {
		display: none;
	}
	.alerts::backdrop {
		background: var(--scrim);
	}
	.panel {
		width: 100%;
		max-height: 85dvh;
		overflow-y: auto;
		background: var(--bg);
		border-top: 2px solid var(--ink);
		padding: 16px 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-size: 20px;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.count {
		font-size: 12px;
		font-weight: 800;
		color: var(--on-accent);
		background: var(--accent);
		padding: 2px 7px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li + li {
		border-top: 1px solid var(--divider-soft);
	}
	.row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 0;
		text-align: left;
	}
	.g {
		width: 24px;
		font-weight: 800;
		color: var(--bad);
	}
	.g.up {
		color: var(--accent);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-size: 15px;
		font-weight: 700;
	}
	.sub {
		font-size: 12px;
		color: var(--text-muted);
	}
	.chev {
		color: var(--text-muted);
	}
	.none {
		margin: 0;
		padding: 12px 0;
		color: var(--text-muted);
	}
	@media (min-width: 1024px) {
		.alerts {
			align-items: flex-start;
			justify-content: flex-start;
			padding: 12px 0 0 72px;
		}
		.panel {
			width: 400px;
			max-height: calc(100vh - 24px);
			border: 2px solid var(--ink);
			box-shadow: var(--shadow-lg);
			padding: 16px 20px 20px;
			animation: wl-fade 0.12s ease-out;
		}
	}
</style>
