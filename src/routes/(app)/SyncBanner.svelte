<script lang="ts">
	// The offline queue as it really is (#311): offline, a sync on its way, no way
	// through to Waterline, or waiting for the next try, and entries the server
	// refused (#225). It syncs when the connection comes back or the app is reopened.
	// Out of the shell (#362).
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { discard, flushQueue, refreshQueue, retry } from '$lib/offline';
	import { toast, ui } from '$lib/ui.svelte';
	import type { LayoutData } from './$types';

	let { data }: { data: LayoutData } = $props();

	async function sync() {
		const n = await flushQueue();
		if (n) {
			toast(`✓ Synced ${n} entr${n === 1 ? 'y' : 'ies'}`);
			invalidateAll();
		}
	}
	onMount(() => {
		// who's signed in on this device: the queue is kept for each person (#108)
		ui.online = navigator.onLine;
		ui.userId = data.user.id;
		refreshQueue().then(sync);
		const on = () => {
			ui.online = true;
			sync();
		};
		const off = () => {
			ui.online = false;
			ui.sync = 'idle';
		};
		const vis = () => document.visibilityState === 'visible' && sync();
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		document.addEventListener('visibilitychange', vis);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
			document.removeEventListener('visibilitychange', vis);
		};
	});
	const waiting = $derived(ui.queue.filter((q) => !q.error).length);
	const syncState = $derived(!ui.online ? 'offline' : ui.sync === 'syncing' ? 'syncing' : ui.sync === 'unreachable' ? 'unreachable' : 'waiting');
	// online with entries still waiting (no answer last time, or the server was restarting): try again every 30 seconds
	$effect(() => {
		if (!ui.online || !waiting || ui.sync === 'syncing') return;
		const t = setInterval(sync, 30_000);
		return () => clearInterval(t);
	});
	// refused by the server: shown whatever tank is on screen, until sent again or dropped (#225)
	const refused = $derived(ui.queue.filter((q) => q.error));
	/** " · Reef 24" for an entry logged to a tank other than the one on screen */
	const inTank = (id: string | null) => {
		const t = id && id !== data.currentTankId ? data.tanks.find((x) => x.id === id) : null;
		return t ? ` · ${t.name}` : '';
	};
	async function retryEntry(id: string) {
		if ((await retry(id)) > 0) {
			toast('✓ Synced');
			invalidateAll();
		}
	}
</script>

{#if !ui.online || waiting}
	<!-- the queue as it really is (#311): offline, a sync on its way, no way through to Waterline, or waiting for the next try -->
	<div class="offline" role="status" data-sync={syncState} data-waiting={waiting}>
		<strong>{ui.online ? '' : 'Offline'}{!ui.online && waiting ? ' · ' : ''}{waiting ? `${waiting} entr${waiting === 1 ? 'y' : 'ies'} waiting` : ''}</strong>
		<span
			>{syncState === 'syncing'
				? 'Syncing…'
				: syncState === 'unreachable'
					? "Saved on this device. Waterline can't be reached right now; they'll sync when it can."
					: syncState === 'waiting'
						? "Saved on this device, waiting to sync."
						: waiting
							? "Saved on this phone. They'll sync when you're back on dry land."
							: "New entries are saved on this phone until you're back on dry land."}</span
		>
		{#if syncState === 'unreachable'}<button type="button" class="btn try" onclick={sync}>Try now</button>{/if}
	</div>
{/if}
{#if refused.length}
	<div class="offline unsynced" role="status" aria-label="Entries that couldn't sync">
		<strong class="status-bad">✕ {refused.length} entr{refused.length === 1 ? 'y' : 'ies'} couldn't sync</strong>
		<ul>
			{#each refused as q (q.id)}
				<li>
					<span class="u-text"><span class="u-title">{q.title}{inTank(q.tankId)}</span><span class="u-why">{q.error}</span></span>
					<span class="u-actions">
						<button type="button" class="btn" onclick={() => retryEntry(q.id)}>Retry<span class="sr-only"> {q.title}</span></button>
						<button type="button" class="btn" onclick={() => discard(q.id)}>Discard<span class="sr-only"> {q.title}</span></button>
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.offline .try {
		align-self: flex-start;
		margin-top: 6px;
	}
	.offline {
		margin: calc(8px + env(safe-area-inset-top)) 20px 0;
		padding: 10px 14px;
		background: var(--surface);
		border-left: 3px solid var(--ink);
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}
	.offline strong {
		font-size: 14px;
	}
	.unsynced {
		border-left-color: var(--accent);
	}
	.unsynced ul {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
	}
	.unsynced li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}
	.unsynced .u-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.unsynced .u-title {
		font-weight: 600;
	}
	.unsynced .u-why {
		color: var(--text-muted);
	}
	.unsynced .u-actions {
		display: flex;
		gap: 8px;
	}
	.unsynced .btn {
		min-height: 44px;
	}
	/* Tablets get the phone layout in a centered column. */
	@media (min-width: 700px) and (max-width: 1023px) {
		.offline {
			width: 100%;
			max-width: 720px;
			margin-inline: auto;
		}
	}
	@media (min-width: 1024px) {
		.offline {
			margin: 16px 32px 0;
		}
	}
</style>
