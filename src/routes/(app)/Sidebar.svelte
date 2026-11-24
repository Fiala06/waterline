<script lang="ts">
	// The desktop sidebar (redesign README → App shell): the tanks, the app-wide
	// links and the account, pinned open or an auto-hiding rail (#362: out of the shell).
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import { ui } from '$lib/ui.svelte';
	import type { LayoutData } from './$types';

	let { data, tankScoped, unread, pickTank }: { data: LayoutData; tankScoped: boolean; unread: number; pickTank: (id: string) => void } = $props();

	const path = $derived(page.url.pathname);
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));
	const footerLine = $derived(data.app.update ? `↑ Update to ${data.app.update.version}` : `Waterline v${data.app.version}`);

	// "1 reading out of range · 2 tasks overdue"
	function attentionText(t: { outOfRange: number; overdue: number }) {
		return [
			t.outOfRange ? `${t.outOfRange} reading${t.outOfRange === 1 ? '' : 's'} out of range` : null,
			t.overdue ? `${t.overdue} task${t.overdue === 1 ? '' : 's'} overdue` : null
		]
			.filter(Boolean)
			.join(' · ');
	}

	// ── Sidebar: pinned or an auto-hiding rail (stored on this device, per user) ──
	let hover = $state(false);
	// pinned until the device's choice is read on mount, so most desktops don't see the rail flash
	const pinned = $derived(ui.navPinned ?? true);
	const wide = $derived(pinned || hover);
	function loadNav() {
		try {
			const v = localStorage.getItem(`wl_nav:${data.user.id}`);
			ui.navPinned = v === 'pinned' ? true : v === 'auto' ? false : innerWidth >= 1200;
		} catch {
			ui.navPinned = innerWidth >= 1200;
		}
	}
	export function togglePin() {
		ui.navPinned = !pinned;
		hover = false;
		try {
			localStorage.setItem(`wl_nav:${data.user.id}`, ui.navPinned ? 'pinned' : 'auto');
		} catch {
			/* storage blocked */
		}
	}
	// "+N more · scroll or see all" under the tank list until it's scrolled to the end
	let list: HTMLElement | undefined = $state();
	let moreTanks = $state(0);
	function listScroll() {
		if (!list) return;
		const left = list.scrollHeight - list.scrollTop - list.clientHeight;
		moreTanks = left > 2 ? Math.max(1, Math.round(left / 48)) : 0;
	}
	$effect(() => {
		data.tanks.length;
		wide;
		requestAnimationFrame(listScroll);
	});
	onMount(loadNav);
</script>

<!-- ── Desktop sidebar ─────────────────────────────────────────────── -->
<div class="navslot" class:rail={!pinned}>
	<aside
		class="sidebar"
		class:wide
		class:floating={!pinned && hover}
		aria-label="Main"
		onmouseenter={() => !pinned && (hover = true)}
		onmouseleave={() => (hover = false)}
	>
		<div class="brand-row">
			<a class="brand" href="/" aria-label="Waterline"><Logo size={26} fish /><span class="lbl word">Waterline</span></a>
			<button type="button" class="pin lbl" title="{pinned ? 'Auto-hide menu' : 'Keep menu open'} [" aria-label="{pinned ? 'Auto-hide menu' : 'Keep menu open'} [" onclick={togglePin}>
				<Icon name={pinned ? 'pin' : 'unpin'} size={18} />
			</button>
		</div>
		<button type="button" class="search" title="Search  ⌘K" onclick={() => (ui.palette = true)}>
			<Icon name="search" size={18} />
			<span class="lbl">Search</span><kbd class="lbl">⌘K</kbd>
		</button>
		<div class="tanks">
			<a class="caps lbl" href="/tanks" class:active={path === '/tanks'}>Tanks<span>All ›</span></a>
			<div class="tank-list" bind:this={list} onscroll={listScroll}>
				{#each data.tanks as t (t.id)}
					<a
						href="/?tank={t.id}"
						class="tank"
						class:current={t.id === data.currentTankId && tankScoped}
						aria-current={t.id === data.currentTankId && tankScoped ? 'true' : undefined}
						title={t.outOfRange || t.overdue ? `${t.name} · ${attentionText(t)}` : t.name}
						onclick={(e) => {
							if (e.metaKey || e.ctrlKey || e.shiftKey) return;
							e.preventDefault();
							pickTank(t.id);
						}}
					>
						<span class="thumb"><TankThumb cover={t.cover} size={28} />{#if t.alerts}<i class="dot" aria-hidden="true"></i>{/if}</span>
						<span class="tname lbl">{t.name}</span>
						<!-- readings out of range (✕, red) and overdue tasks (▲) apart; the title spells them out -->
						{#if t.outOfRange || t.overdue}
							<span class="st lbl" aria-label={attentionText(t)}>
								{#if t.outOfRange}<span class="bad">✕ {t.outOfRange}</span>{/if}{#if t.overdue}<span class="warn">▲ {t.overdue}</span>{/if}
							</span>
						{:else}
							<span class="st lbl" aria-label={t.tested ? 'All in range' : 'No data'}>{t.tested ? '✓' : '–'}</span>
						{/if}
					</a>
				{/each}
			</div>
			{#if moreTanks && wide}
				<a class="more-tanks" href="/tanks">+{moreTanks} more · scroll or see all</a>
			{/if}
			<a class="add" href="/tanks/new" title="Add tank"><span class="plus">+</span><span class="lbl">Add tank</span></a>
		</div>
		<div class="rule"></div>
		<nav class="links" aria-label="App">
			<a href="/alerts" class="link" class:active={path.startsWith('/alerts')} aria-current={path.startsWith('/alerts') ? 'page' : undefined} title="Alerts">
				<span class="ic"><Icon name="bell" />{#if unread}<span class="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>{/if}</span>
				<span class="lbl">Alerts</span>{#if unread}<span class="sr-only">{unread} unread</span>{/if}
			</a>
			<a href="/tasks" class="link" class:active={path.startsWith('/tasks')} aria-current={path.startsWith('/tasks') ? 'page' : undefined} title="Tasks">
				<span class="ic"><Icon name="tasks" /></span>
				<span class="lbl">Tasks</span>
				{#if data.overdueCount}<span class="tag tag-accent lbl">{data.overdueCount} overdue</span>{/if}
			</a>
			<!-- Calculators (#80): for the tank you're on -->
			<a
				href="/calculators{current ? `?tank=${current.id}` : ''}"
				class="link"
				class:active={path.startsWith('/calculators')}
				aria-current={path.startsWith('/calculators') ? 'page' : undefined}
				title="Calculators"
			>
				<span class="ic"><Icon name="calculator" /></span>
				<span class="lbl">Calculators</span>
			</a>
			<a href="/settings" class="link" class:active={path.startsWith('/settings')} aria-current={path.startsWith('/settings') ? 'page' : undefined} title="Settings">
				<span class="ic"><Icon name="settings" /></span>
				<span class="lbl">Settings</span>
			</a>
		</nav>
		<div class="spacer"></div>
		<div class="foot">
			<span class="avatar">
				<AccountMenu user={data.user} id="account-menu-side" />
				{#if data.app.update}<span class="upd" title="Update available" aria-hidden="true">↑</span>{/if}
			</span>
			<span class="me lbl">
				<span class="me-name">{data.user.displayName || data.user.email}</span>
				<a href="/settings/changelog" class="ver" class:update={!!data.app.update}>{footerLine}</a>
			</span>
		</div>
	</aside>
</div>

<style>
	.navslot {
		display: none;
	}
	:global(.fullscreen) .navslot {
		display: none !important;
	}
	.caps {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.spacer {
		flex: 1;
	}
	@media (min-width: 1024px) {
		/* the sidebar's slot in the row: 248px pinned, a 64px rail otherwise */
		.navslot {
			display: block;
			width: 248px;
			flex-shrink: 0;
			position: sticky;
			top: 0;
			height: 100dvh;
			z-index: 25;
			transition: width 160ms ease;
		}
		.navslot.rail {
			width: 64px;
		}
		.sidebar {
			position: absolute;
			inset: 0 auto 0 0;
			width: 64px;
			display: flex;
			flex-direction: column;
			gap: 14px;
			padding: 20px 12px;
			overflow-x: hidden;
			overflow-y: auto;
			scrollbar-width: none;
			background: var(--bg);
			border-right: 2px solid var(--divider);
			transition:
				width 160ms ease,
				box-shadow 160ms;
		}
		.sidebar.wide {
			width: 248px;
		}
		.sidebar.floating {
			box-shadow: var(--shadow-lg);
		}
		/* labels fade out in the rail */
		.lbl {
			opacity: 0;
			transition: opacity 120ms;
			white-space: nowrap;
		}
		.wide .lbl {
			opacity: 1;
		}
		.brand-row {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 0 8px;
			min-width: 224px;
			flex-shrink: 0;
		}
		.brand {
			flex: 1;
			display: flex;
			align-items: center;
			gap: 8px;
			color: var(--text);
		}
		.word {
			font-weight: 800;
			font-size: 18px;
			letter-spacing: -0.015em;
		}
		.pin {
			width: 36px;
			height: 36px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--text-muted);
		}
		@media (hover: hover) {
			.pin:hover {
				color: var(--text);
				background: var(--surface);
			}
		}
		.search {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 10px;
			height: 40px;
			padding: 0 8px;
			min-width: 224px;
			border: 1px solid var(--divider);
			text-align: left;
			font-size: 14px;
			color: var(--text-muted);
		}
		.search :global(svg) {
			margin: 0 5px;
			flex-shrink: 0;
		}
		.search .lbl:first-of-type {
			flex: 1;
		}
		.search kbd {
			font: inherit;
			font-size: 12px;
		}
		@media (hover: hover) {
			.search:hover {
				border-color: var(--text);
				color: var(--text);
			}
		}
		.tanks {
			display: flex;
			flex-direction: column;
			min-width: 224px;
			flex: 0 1 auto;
			min-height: calc(144px + 76px);
		}
		.tanks .caps {
			display: flex;
			justify-content: space-between;
			padding: 6px 8px 8px;
		}
		.tanks .caps.active {
			color: var(--accent-text);
		}
		/* the whole "TANKS · All ›" row opens Tanks */
		@media (hover: hover) {
			.tanks .caps:hover {
				color: var(--accent-text);
				text-decoration: underline;
				text-underline-offset: 3px;
			}
		}
		.tank-list {
			display: flex;
			flex-direction: column;
			flex: 1 1 auto;
			min-height: 144px;
			overflow-y: auto;
			overflow-x: hidden;
			scrollbar-width: thin;
		}
		.tank {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 10px;
			height: 48px;
			padding: 0 8px;
			font-size: 14px;
			color: var(--text);
			border-left: 3px solid transparent;
			margin-left: -3px;
		}
		@media (hover: hover) {
			.tank:hover {
				background: var(--surface);
			}
		}
		.tank.current {
			background: var(--surface);
			border-left-color: var(--accent);
			font-weight: 800;
		}
		.thumb {
			position: relative;
			flex-shrink: 0;
			display: flex;
		}
		.dot {
			position: absolute;
			top: -4px;
			right: -4px;
			width: 10px;
			height: 10px;
			background: var(--accent);
			border: 2px solid var(--bg);
		}
		.tname {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.st {
			font-size: 12px;
			font-weight: 800;
		}
		.st {
			display: flex;
			gap: 8px;
		}
		.st .bad {
			color: var(--bad);
		}
		.st .warn {
			color: var(--warn);
		}
		.more-tanks {
			flex-shrink: 0;
			border-top: 1px solid var(--divider);
			padding: 6px 8px;
			font-size: 12px;
			font-weight: 800;
			color: var(--text-muted);
			white-space: nowrap;
		}
		@media (hover: hover) {
			.more-tanks:hover {
				color: var(--accent-text);
			}
		}
		.add {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 8px;
			font-size: 14px;
			font-weight: 800;
			color: var(--accent-text);
		}
		.add .plus {
			width: 28px;
			text-align: center;
			font-size: 18px;
			line-height: 1;
		}
		.rule {
			height: 2px;
			flex-shrink: 0;
			background: var(--divider);
		}
		.links {
			display: flex;
			flex-direction: column;
			min-width: 224px;
			flex-shrink: 0;
		}
		.link {
			display: flex;
			align-items: center;
			gap: 10px;
			height: 44px;
			padding: 0 8px;
			font-size: 14px;
			color: var(--text);
			text-align: left;
			width: 100%;
		}
		.link .lbl:first-of-type {
			flex: 1;
		}
		@media (hover: hover) {
			.link:hover {
				background: var(--surface);
			}
		}
		.link.active {
			background: var(--surface);
			font-weight: 800;
		}
		.ic {
			position: relative;
			display: flex;
			margin: 0 4px;
			flex-shrink: 0;
		}
		.badge {
			position: absolute;
			top: -7px;
			right: -8px;
			min-width: 16px;
			height: 16px;
			padding: 0 3px;
			background: var(--accent);
			color: var(--on-accent);
			font-size: 10px;
			font-weight: 800;
			display: flex;
			align-items: center;
			justify-content: center;
			border: 2px solid var(--bg);
			box-sizing: content-box;
		}
		.foot {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 12px 0 0;
			border-top: 1px solid var(--divider);
			min-width: 224px;
			flex-shrink: 0;
		}
		.avatar {
			position: relative;
			flex-shrink: 0;
			display: flex;
		}
		.upd {
			position: absolute;
			top: -2px;
			right: -2px;
			width: 16px;
			height: 16px;
			background: var(--accent);
			color: var(--on-accent);
			font-size: 11px;
			font-weight: 800;
			display: flex;
			align-items: center;
			justify-content: center;
			pointer-events: none;
		}
		.me {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			font-size: 13px;
			line-height: 1.3;
		}
		.me-name {
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.ver {
			font-size: 12px;
			color: var(--text-muted);
		}
		.ver.update {
			color: var(--accent-text);
			font-weight: 800;
		}
		@media (hover: hover) {
			.ver:hover {
				text-decoration: underline;
			}
		}
	}
</style>
