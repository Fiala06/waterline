<script lang="ts">
	// ⌘K / "/": tanks, this tank's tabs, and actions such as Log test, Share summary
	// and Keyboard shortcuts, each with its key. Type to filter; ↑↓ move, ↵ opens.
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { tankTypeLabel } from '$lib/types';
	import { dropFocus, logHref, ui } from '$lib/ui.svelte';
	import Icon from './Icon.svelte';
	import TankThumb from './TankThumb.svelte';

	interface TankSummary {
		id: string;
		name: string;
		type: string;
		volume: string | null;
		alerts: number;
		outOfRange?: number;
		overdue?: number;
		cover?: string | null;
	}
	interface Item {
		group: 'Tanks' | 'Go to' | 'Actions';
		title: string;
		sub?: string;
		key?: string;
		cover?: string | null;
		run: () => void;
	}
	let {
		open = $bindable(false),
		tanks,
		currentTankId,
		onpick
	}: {
		open?: boolean;
		tanks: TankSummary[];
		currentTankId: string | null;
		/** open a tank (keeps the page when it's about a tank) */
		onpick: (id: string) => void;
	} = $props();

	let q = $state('');
	let cursor = $state(0);
	let search: HTMLInputElement | undefined = $state();
	let dialog: HTMLDialogElement | undefined = $state();

	const current = $derived(tanks.find((t) => t.id === currentTankId));
	const base = $derived(current ? `/tanks/${current.id}` : null);
	const go = (href: string) => () => goto(href);
	const items = $derived.by((): Item[] => {
		const list: Item[] = tanks.map((t) => ({
			group: 'Tanks',
			title: t.name,
			sub: `${tankTypeLabel(t.type)}${t.volume ? ` · ${t.volume}` : ''}${t.outOfRange ? ` · ✕ ${t.outOfRange}` : ''}${t.overdue ? ` · ▲ ${t.overdue}` : ''}`,
			cover: t.cover,
			run: () => onpick(t.id)
		}));
		if (current && base) {
			const tabs: [string, string, string][] = [
				['Overview', `/?tank=${current.id}`, 'G O'],
				['Charts', `/charts?tank=${current.id}`, 'G C'],
				['History', `/history?tank=${current.id}`, 'G H'],
				['Photos', `/photos?tank=${current.id}`, 'G P'],
				['Livestock', `${base}/livestock`, 'G L'],
				['Plants', `${base}/plants`, ''],
				['Equipment', `${base}/equipment`, 'G E'],
				['Spending', `${base}/spending`, ''],
				['Setup', `${base}/settings`, 'G S']
			];
			for (const [title, href, key] of tabs) list.push({ group: 'Go to', title, sub: current.name, key, run: go(href) });
			list.push(
				{ group: 'Actions', title: 'Log water test', sub: current.name, key: 'T', run: go(logHref('test', current.id)) },
				{ group: 'Actions', title: 'Log water change', sub: current.name, key: 'W', run: go(logHref('water_change', current.id)) },
				{ group: 'Actions', title: 'Log dosing', sub: current.name, key: 'D', run: go(logHref('dosing', current.id)) },
				{ group: 'Actions', title: 'Add a note', sub: current.name, key: 'N', run: go(logHref('note', current.id)) },
				{ group: 'Actions', title: 'Add several livestock', sub: current.name, run: go(`${base}/livestock/several`) },
				{ group: 'Actions', title: 'Share summary', sub: `${current.name} · for a forum, a friend, your fish store or an AI chat`, run: go(`${base}/summary`) },
				{ group: 'Actions', title: 'Public page', sub: current.name, run: go(`${base}/public`) },
				{ group: 'Actions', title: 'Export this tank', sub: current.name, run: go(`/settings/export?tank=${current.id}`) },
				{ group: 'Actions', title: 'Review tank setup', sub: current.name, run: go(`${base}/review`) },
				{ group: 'Actions', title: 'Calculators', sub: `${current.name} · volume, water change, dosing, heater, substrate, CO₂`, run: go(`/calculators?tank=${current.id}`) }
			);
		}
		list.push(
			{ group: 'Actions', title: 'Alerts', sub: 'Out-of-range readings and overdue tasks', run: () => (ui.alerts = true) },
			{ group: 'Actions', title: 'Tasks', sub: 'Every tank', run: go('/tasks') },
			{ group: 'Actions', title: 'Add tank', run: go('/tanks/new') },
			{ group: 'Actions', title: 'Theme', sub: 'Light, dark or system', run: go('/settings#theme') },
			{ group: 'Actions', title: 'Settings', run: go('/settings') },
			{ group: 'Actions', title: 'Keyboard shortcuts', key: '?', run: () => (ui.keys = true) }
		);
		return list;
	});
	const shown = $derived.by(() => {
		const s = q.trim().toLowerCase();
		if (!s) return items;
		return items.filter((i) => i.title.toLowerCase().includes(s) || i.sub?.toLowerCase().includes(s));
	});
	const groups = $derived.by(() => {
		const out: { name: Item['group']; items: { item: Item; i: number }[] }[] = [];
		shown.forEach((item, i) => {
			const g = out.find((o) => o.name === item.group);
			if (g) g.items.push({ item, i });
			else out.push({ name: item.group, items: [{ item, i }] });
		});
		return out;
	});

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			q = '';
			cursor = 0;
			dialog.showModal();
			tick().then(() => search?.focus());
		}
		if (!open && dialog.open) dialog.close();
	});
	$effect(() => {
		q;
		cursor = 0;
	});

	function run(item: Item) {
		open = false;
		item.run();
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(cursor + 1, shown.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(cursor - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (shown[cursor]) run(shown[cursor]);
		}
	}
	$effect(() => {
		if (!open) return;
		cursor;
		dialog?.querySelector<HTMLElement>('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
	});
</script>

<dialog
	bind:this={dialog}
	class="pal"
	aria-label="Search"
	onclose={() => {
		open = false;
		dropFocus(dialog);
	}}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
	{onkeydown}
>
	{#if open}
	<div class="panel">
		<label class="search">
			<Icon name="search" size={18} />
			<span class="sr-only">Search tanks or type an action</span>
			<input bind:this={search} bind:value={q} placeholder="Search tanks or type an action" autocomplete="off" spellcheck="false" />
			<kbd>Esc</kbd>
		</label>
		<div class="list" role="listbox" aria-label="Results">
			{#each groups as g (g.name)}
				<div class="group">{g.name}</div>
				{#each g.items as { item, i } (`${g.name}:${item.title}`)}
					<button
						type="button"
						class="row"
						role="option"
						aria-selected={cursor === i}
						data-cursor={cursor === i}
						onmousemove={() => (cursor = i)}
						onclick={() => run(item)}
					>
						{#if item.group === 'Tanks'}<TankThumb cover={item.cover} size={28} />{/if}
						<span class="text">
							<span class="title">{item.title}</span>
							{#if item.sub}<span class="sub">{item.sub}</span>{/if}
						</span>
						{#if item.key}<kbd>{item.key}</kbd>{/if}
					</button>
				{/each}
			{:else}
				<p class="none">No tank or action matches “{q}”</p>
			{/each}
		</div>
		<div class="foot">
			<span><kbd>↑↓</kbd> move</span>
			<span><kbd>↵</kbd> open</span>
			<span class="hint">T W D N log from any tank page</span>
			<span class="right"><kbd>[</kbd> toggle menu</span>
		</div>
	</div>
	{/if}
</dialog>

<style>
	.pal {
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
		align-items: flex-start;
		justify-content: center;
		padding-top: min(12vh, 96px);
	}
	.pal:not([open]) {
		display: none;
	}
	.pal::backdrop {
		background: var(--scrim);
	}
	.panel {
		width: min(640px, calc(100vw - 32px));
		max-height: calc(100vh - 140px);
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		animation: wl-fade 0.12s ease-out;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 56px;
		padding: 0 16px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.search input {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		background: transparent;
		border: none;
		outline: none;
		font-size: 16px;
	}
	kbd {
		font: inherit;
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.list {
		overflow-y: auto;
		padding: 4px 0 8px;
	}
	.group {
		padding: 10px 16px 4px;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 8px 16px;
		text-align: left;
		border-left: 3px solid transparent;
	}
	.row[aria-selected='true'] {
		background: var(--surface);
		border-left-color: var(--accent);
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
	.none {
		margin: 0;
		padding: 20px 16px;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		gap: 16px;
		align-items: center;
		padding: 8px 16px;
		border-top: 1px solid var(--divider);
		font-size: 12px;
		color: var(--text-muted);
	}
	.foot .right {
		margin-left: auto;
	}
	@media (max-width: 1023px) {
		.hint {
			display: none;
		}
	}
</style>
