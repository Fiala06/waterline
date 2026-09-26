<script lang="ts">
	// G12 · Desktop tank switcher: a dropdown under the header button. Type to
	// filter, Enter picks the first match, 1–9 pick by position, Esc closes.
	import { tankTypeLabel } from '$lib/types';
	import { tick } from 'svelte';
	import TankThumb from './TankThumb.svelte';

	interface TankSummary {
		id: string;
		name: string;
		type: string;
		volume: string | null;
		alerts: number;
		cover?: string | null;
		tested?: boolean;
	}
	let {
		open = $bindable(false),
		tanks,
		currentId,
		onpick
	}: {
		open?: boolean;
		tanks: TankSummary[];
		currentId: string | null;
		onpick: (id: string) => void;
	} = $props();

	let q = $state('');
	let search: HTMLInputElement | undefined = $state();
	const shown = $derived(tanks.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase())));
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

	$effect(() => {
		if (!open) return;
		q = '';
		tick().then(() => search?.focus());
	});

	function pick(id: string) {
		open = false;
		onpick(id);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		} else if (e.key === 'Enter' && shown[0]) {
			e.preventDefault();
			pick(shown[0].id);
		} else if (!q && /^[1-9]$/.test(e.key) && tanks[Number(e.key) - 1]) {
			e.preventDefault();
			pick(tanks[Number(e.key) - 1].id);
		}
	}
</script>

{#if open}
	<button type="button" class="scrim" tabindex="-1" aria-label="Close tank list" onclick={() => (open = false)}></button>
	<div class="menu" role="dialog" aria-label="Switch tank" tabindex="-1" {onkeydown}>
		<label class="search">
			<span class="sr-only">Search tanks</span>
			<input bind:this={search} bind:value={q} placeholder="Search tanks…" autocomplete="off" />
			<kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
		</label>
		<ul>
			{#each shown as t (t.id)}
				<li>
					<button type="button" class="row" class:current={t.id === currentId} aria-current={t.id === currentId} onclick={() => pick(t.id)}>
						<TankThumb cover={t.cover} size={32} radius={8} />
						<span class="text">
							<span class="name">{t.name}</span>
							<span class="sub">{tankTypeLabel(t.type)}{t.volume ? ` · ${t.volume}` : ''}</span>
						</span>
						{#if t.alerts}
							<span class="pill-bad">{t.alerts} alert{t.alerts === 1 ? '' : 's'}</span>
						{:else if t.tested}
							<span class="good">All good</span>
						{:else}
							<span class="nodata">No data</span>
						{/if}
						{#if tanks.indexOf(t) < 9}<kbd class="num" aria-hidden="true">{tanks.indexOf(t) + 1}</kbd>{/if}
					</button>
				</li>
			{:else}
				<li class="none">No tank matches “{q}”</li>
			{/each}
		</ul>
		<div class="foot">
			<a href="/tanks/new" onclick={() => (open = false)}>+ Add tank</a>
			<a href="/tanks" onclick={() => (open = false)}>Manage tanks</a>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		cursor: default;
	}
	.menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 31;
		width: 360px;
		padding: 10px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		box-shadow: var(--shadow-modal);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 42px;
		padding: 0 12px;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
	}
	.search:focus-within {
		border-color: var(--accent);
	}
	.search input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		background: transparent;
		border: none;
		outline: none;
		font-size: 14px;
	}
	kbd {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12px;
		color: var(--text-faint);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 60vh;
		overflow-y: auto;
	}
	.row {
		width: 100%;
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 10px;
		text-align: left;
	}
	.row:hover,
	.row:focus-visible {
		background: var(--surface-2);
	}
	.row.current {
		background: var(--selected);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: 12px;
		color: var(--text-muted);
	}
	.pill-bad {
		font-size: 12px;
		font-weight: 700;
		background: var(--bad-bg);
		color: var(--bad-text);
		padding: 2px 7px;
		border-radius: 9px;
		white-space: nowrap;
	}
	.good,
	.nodata {
		font-size: 12px;
		font-weight: 600;
		color: var(--ok);
		white-space: nowrap;
	}
	.nodata {
		color: var(--text-muted);
	}
	.num {
		width: 12px;
		text-align: right;
	}
	.none {
		padding: 12px 10px;
		font-size: 14px;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		justify-content: space-between;
		border-top: 1px solid var(--border);
		padding: 4px 4px 0;
	}
	.foot a {
		font-size: 14px;
		font-weight: 600;
		min-height: 40px;
		display: flex;
		align-items: center;
		padding: 0 6px;
	}
</style>
