<script lang="ts">
	// The tank workspace header: the cover, a kicker ("PLANTED · 40 GAL · DAY 201 ·
	// LAST TEST TODAY"), the name at 42/800, then Get help, the Log water test
	// split button and the More menu; under them, the tabs with their counts.
	// On phones the name opens the Switch tank sheet and the bell sits at the right.
	import { goto } from '$app/navigation';
	import { daysBetween } from '$lib/time';
	import { tankTypeLabel } from '$lib/types';
	import { photoUrl } from '$lib/media';
	import { logHref, ui } from '$lib/ui.svelte';
	import { hscroll } from '$lib/actions';
	import Icon from './Icon.svelte';

	export interface Tab {
		key: string;
		label: string;
		href: string;
		count?: number | null;
		active: boolean;
	}
	let {
		tank,
		lastTest,
		today,
		tabs,
		unread = 0,
		tabsOnPhone = false
	}: {
		tank: { id: string; name: string; type: string; volume: string | null; startDate: string | null; cover: string | null; coverPos?: string };
		/** "Last test today, 8:12 AM" or "No tests yet" */
		lastTest: string;
		today: string;
		tabs: Tab[];
		/** unread alerts, on the phone's bell */
		unread?: number;
		/** phones show the tab strip only on pages the bottom bar doesn't reach */
		tabsOnPhone?: boolean;
	} = $props();

	const day = $derived(tank.startDate && tank.startDate <= today ? daysBetween(tank.startDate, today) + 1 : null);
	const kicker = $derived([tankTypeLabel(tank.type), tank.volume, day ? `Day ${day}` : null].filter(Boolean).join(' · '));

	let logMenu = $state(false);
	let moreMenu = $state(false);
	const base = $derived(`/tanks/${tank.id}`);
	const more = $derived([
		{ title: 'Get help: copy a summary', sub: 'For a forum, a friend, your fish store or an AI chat', href: `${base}/summary` },
		{ title: 'Export this tank', sub: 'A backup or CSV in Settings › Import & export', href: `/settings/export?tank=${tank.id}` },
		{ title: 'Public page', sub: 'Share a read-only page', href: `${base}/public` },
		{ title: 'Tank details', sub: 'Specs, notes and routines', href: base, sep: true },
		{ title: 'Review tank setup', sub: 'Walk through details, equipment, targets and livestock', href: `${base}/review` },
		{ title: 'Archive tank', sub: 'Hide it from the list; you can restore it', href: `${base}/settings#archive`, sep: true, danger: true }
	]);
	const logKinds = [
		{ kind: 'water_change', label: 'Water change', key: 'W' },
		{ kind: 'dosing', label: 'Dose', key: 'D' },
		{ kind: 'note', label: 'Note', key: 'N' },
		{ kind: 'maintenance', label: 'Maintenance', key: '' }
	] as const;
	function closeMenus() {
		logMenu = false;
		moreMenu = false;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && (logMenu || moreMenu)) {
			e.preventDefault();
			closeMenus();
		}
	}}
/>

<header class="th">
	<div class="top">
		<div class="who">
			<span class="cover hide-phone" class:photo-placeholder={!tank.cover} aria-hidden="true">
				{#if tank.cover}<img src={photoUrl(tank.cover)} alt="" style:object-position={tank.coverPos} />{/if}
			</span>
			<div class="names">
				<span class="kicker">{kicker}<span class="hide-phone"> · {lastTest}</span></span>
				<h1 class="hide-phone">{tank.name}</h1>
				<button type="button" class="name hide-desk" aria-label="{tank.name}, switch tank" onclick={() => (ui.tankSwitcher = true)}>
					{tank.name} <span class="caret" aria-hidden="true">▾</span>
				</button>
			</div>
		</div>
		<!-- phones: the bell; desktop: Get help, Log water test ▾, More ▾ -->
		<button type="button" class="bell hide-desk" aria-label="Alerts{unread ? `, ${unread} unread` : ''}" onclick={() => (ui.alerts = true)}>
			<Icon name="bell" size={22} />
			{#if unread}<span class="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>{/if}
		</button>
		<div class="actions hide-phone">
			<a class="btn-text" href="{base}/summary">Get help</a>
			<div class="split">
				<a class="btn btn-primary main" href={logHref('test', tank.id)}>Log water test <kbd>T</kbd></a>
				<button
					type="button"
					class="btn btn-primary drop"
					aria-label="Other log types"
					aria-expanded={logMenu}
					onclick={() => {
						moreMenu = false;
						logMenu = !logMenu;
					}}>▾</button
				>
				{#if logMenu}
					<div class="menu log" role="menu" aria-label="Log">
						{#each logKinds as k (k.kind)}
							<a role="menuitem" href={logHref(k.kind, tank.id)} onclick={closeMenus}>
								<span>Log {k.label.toLowerCase()}</span>{#if k.key}<kbd>{k.key}</kbd>{/if}
							</a>
						{/each}
						<button
							type="button"
							role="menuitem"
							onclick={() => {
								closeMenus();
								ui.quickAdd = true;
							}}><span>More…</span></button
						>
					</div>
				{/if}
			</div>
			<div class="morewrap">
				<button
					type="button"
					class="btn"
					aria-haspopup="menu"
					aria-expanded={moreMenu}
					onclick={() => {
						logMenu = false;
						moreMenu = !moreMenu;
					}}><Icon name="more" size={18} /> More <span class="caret" aria-hidden="true">▾</span></button
				>
				{#if moreMenu}
					<div class="menu more" role="menu" aria-label="More">
						{#each more as m (m.href)}
							{#if m.sep}<hr />{/if}
							<a role="menuitem" href={m.href} class:danger={m.danger} onclick={closeMenus}>
								<span class="mt">{m.title}</span>
								<span class="ms">{m.sub}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
	{#if logMenu || moreMenu}
		<button type="button" class="scrim" tabindex="-1" aria-label="Close menu" onclick={closeMenus}></button>
	{/if}
	<nav class="tabs hscroll" class:phone-too={tabsOnPhone} aria-label="Tank sections" use:hscroll={tabs.find((t) => t.active)?.key}>
		{#each tabs as t (t.key)}
			<a href={t.href} class:active={t.active} aria-current={t.active ? 'page' : undefined}>
				{t.label}{#if t.count}<span class="n">{t.count}</span>{/if}
			</a>
		{/each}
	</nav>
</header>

<style>
	.th {
		position: relative;
		padding: calc(16px + env(safe-area-inset-top)) 20px 0;
		display: flex;
		flex-direction: column;
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		flex-wrap: wrap;
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: flex-start;
		gap: 20px;
	}
	.names {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.kicker {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	h1 {
		margin: 0;
		font-size: 42px;
		line-height: 1.05;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name {
		text-align: left;
		font-size: 28px;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.015em;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
	}
	.name > :first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.caret {
		font-size: 14px;
		color: var(--text-muted);
	}
	.cover {
		width: 84px;
		height: 84px;
		flex-shrink: 0;
		overflow: hidden;
	}
	.cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.bell {
		position: relative;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--divider);
		margin-top: 2px;
	}
	.badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 11px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 18px;
	}
	.split {
		position: relative;
		display: flex;
	}
	.split .main kbd {
		font: inherit;
		font-weight: 400;
		opacity: 0.8;
		margin-left: 4px;
	}
	.split .drop {
		width: 36px;
		padding: 0;
		border-left: 1px solid rgba(255, 255, 255, 0.4);
	}
	.morewrap {
		position: relative;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		cursor: default;
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 31;
		width: 280px;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		padding: 6px 0;
	}
	.menu.log {
		width: 220px;
	}
	.menu a,
	.menu button {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 9px 14px;
		text-align: left;
		color: var(--text);
		width: 100%;
	}
	.menu.log a,
	.menu.log button {
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		min-height: 40px;
		font-size: 14px;
		font-weight: 700;
	}
	.menu kbd {
		font: inherit;
		font-size: 12px;
		color: var(--text-muted);
	}
	.menu a:hover,
	.menu button:hover {
		background: var(--surface);
	}
	.menu hr {
		border: none;
		border-top: 1px solid var(--divider);
		margin: 6px 0;
	}
	.mt {
		font-size: 14px;
		font-weight: 700;
	}
	.ms {
		font-size: 12px;
		color: var(--text-muted);
	}
	.menu a.danger .mt {
		color: var(--bad);
	}
	/* tabs: 14px labels with counts, the active one underlined in the accent */
	.tabs {
		margin: 12px -20px 0;
		padding: 0 20px;
		gap: 18px;
		border-bottom: 2px solid var(--divider);
		display: none;
	}
	.tabs.phone-too {
		display: flex;
	}
	.tabs a {
		min-height: 44px;
		padding: 0 2px 10px;
		display: flex;
		align-items: flex-end;
		gap: 5px;
		font-size: 14px;
		color: var(--text);
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
	}
	.tabs a .n {
		font-size: 12px;
		color: var(--text-muted);
	}
	.tabs a:hover {
		color: var(--accent-text);
	}
	.tabs a.active {
		color: var(--accent-text);
		font-weight: 800;
		border-bottom-color: var(--accent);
	}
	.tabs a.active .n {
		color: var(--accent-text);
	}
	@media (min-width: 1024px) {
		.th {
			padding: 28px 32px 0;
		}
		.tabs {
			display: flex;
			margin: 24px 0 0;
			padding: 0;
			gap: 28px;
		}
		.tabs a {
			padding-bottom: 12px;
		}
	}
	@media (min-width: 1024px) and (max-width: 1279px) {
		.tabs {
			gap: 22px;
		}
	}
</style>
