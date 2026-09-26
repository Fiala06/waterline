<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { flushQueue, refreshQueue } from '$lib/offline';
	import { listenForInstall } from '$lib/install.svelte';
	import { page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import TankSwitcher from '$lib/components/TankSwitcher.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toast, ui } from '$lib/ui.svelte';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));

	// Phone tab bar + FAB show on the four top-level tabs only; forms are full screen.
	const tabRoutes = ['/', '/tanks', '/tasks', '/settings', '/history', '/charts', '/photos'];
	const showTabs = $derived(tabRoutes.includes(path));
	// The photo viewer is full screen, without the sidebar or header.
	const fullscreen = $derived(path.startsWith('/photos/'));

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/tanks', label: 'Tanks' },
		{ href: '/tasks', label: 'Tasks' },
		{ href: '/history', label: 'History' },
		{ href: '/charts', label: 'Charts' },
		{ href: '/photos', label: 'Photos' }
	];
	const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

	function pickTank(id: string) {
		const u = new URL(page.url);
		u.searchParams.set('tank', id);
		u.searchParams.delete('task');
		const keepPage = tabRoutes.includes(u.pathname) || u.pathname.startsWith('/log/');
		goto(keepPage ? `${u.pathname}?${u.searchParams}` : `/?tank=${id}`);
	}

	// Offline queue: sync when the connection comes back or the app is reopened.
	async function sync() {
		const n = await flushQueue();
		if (n) {
			toast(`✓ Synced ${n} entr${n === 1 ? 'y' : 'ies'}`);
			invalidateAll();
		}
	}
	onMount(() => {
		listenForInstall();
		ui.online = navigator.onLine;
		try {
			const t = sessionStorage.getItem('wl_toast');
			if (t) {
				sessionStorage.removeItem('wl_toast');
				toast(t);
			}
		} catch {
			/* storage blocked */
		}
		refreshQueue().then(sync);
		const on = () => {
			ui.online = true;
			sync();
		};
		const off = () => (ui.online = false);
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

	// Server messages (after a redirect) and browser ones share one toast.
	$effect(() => {
		const f = data.flash;
		if (f) ui.toast = { text: f.text, id: f.id, undo: f.undo };
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== '+' || e.metaKey || e.ctrlKey) return;
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, dialog')) return;
		e.preventDefault();
		ui.quickAdd = true;
	}

	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<svelte:window {onkeydown} />

<div class="shell" class:fullscreen>
	<aside class="sidebar" aria-label="Main">
		<a class="brand" href="/"><Logo size={28} wordmark wordSize={19} /></a>
		<nav class="nav">
			{#each nav as n (n.href)}
				<a href={n.href} class:active={isActive(n.href)} aria-current={isActive(n.href) ? 'page' : undefined}>
					<span>{n.label}</span>
					{#if n.href === '/tasks' && data.overdueCount}
						<span class="pill-bad">{data.overdueCount} overdue</span>
					{/if}
				</a>
			{/each}
		</nav>
		{#if data.tanks.length}
			<div class="tank-list">
				<div class="caps">Tanks</div>
				{#each data.tanks as t (t.id)}
					<a
						href="/?tank={t.id}"
						class="tank"
						class:current={t.id === data.currentTankId}
						aria-current={t.id === data.currentTankId ? 'true' : undefined}
					>
						<TankThumb cover={t.cover} size={24} radius={6} />
						<span class="tname">{t.name}</span>
						{#if t.alerts}
							<span class="pill-bad sm">{t.alerts} alert{t.alerts === 1 ? '' : 's'}</span>
						{:else}
							<span class="good">All good</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
		<div class="spacer"></div>
		<a href="/settings" class="settings" class:active={isActive('/settings')}>Settings</a>
	</aside>

	<div class="main">
		<header class="topbar">
			{#if current}
				<button type="button" class="tank-btn" onclick={() => (ui.tankSwitcher = true)}>
					<TankThumb cover={current.cover} size={40} radius={10} />
					<span class="tb-text">
						<span class="tb-name">{current.name} <span class="caret">▾</span></span>
						<span class="tb-sub">{cap(current.type)}{current.volume ? ` · ${current.volume}` : ''}</span>
					</span>
				</button>
			{/if}
			<div class="spacer"></div>
			{#if current}<span class="tb-meta">{data.quick.lastTest}</span>{/if}
			<button type="button" class="btn btn-primary" onclick={() => (ui.quickAdd = true)}>
				<span class="plus">+</span>Quick add
			</button>
		</header>

		{#if !ui.online || waiting}
			<div class="offline" role="status">
				<strong>{ui.online ? '' : 'Offline'}{!ui.online && waiting ? ' · ' : ''}{waiting ? `${waiting} entr${waiting === 1 ? 'y' : 'ies'} waiting` : ''}</strong>
				<span>{ui.online ? 'Syncing…' : waiting ? "Saved on this phone. They'll sync when you're back online." : 'New entries are saved on this phone until you’re back online.'}</span>
			</div>
		{/if}
		<main class:with-tabs={showTabs}>
			{@render children()}
		</main>
	</div>
</div>

{#if showTabs}
	<button type="button" class="fab" aria-label="Quick add" onclick={() => (ui.quickAdd = true)}>+</button>
	<nav class="tabbar" aria-label="Main">
		<a href="/" class:active={isActive('/')} aria-current={isActive('/') ? 'page' : undefined}>
			<span class="ti ti-dash" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Dashboard
		</a>
		<a href="/tanks" class:active={isActive('/tanks')} aria-current={isActive('/tanks') ? 'page' : undefined}>
			<span class="ti ti-tanks" aria-hidden="true"></span>Tanks
		</a>
		<a href="/tasks" class:active={isActive('/tasks')} aria-current={isActive('/tasks') ? 'page' : undefined}>
			<span class="ti ti-tasks" aria-hidden="true"></span>Tasks
		</a>
		<a
			href="/settings"
			class:active={isActive('/settings')}
			aria-current={isActive('/settings') ? 'page' : undefined}
		>
			<span class="ti ti-settings" aria-hidden="true"><i></i></span>Settings
		</a>
	</nav>
{/if}

<QuickAdd
	bind:open={ui.quickAdd}
	tanks={data.tanks}
	currentTankId={data.currentTankId}
	timeZone={data.user.timeZone}
	lastTest={data.quick.lastTest}
	wcDue={data.quick.wcDue}
/>
<TankSwitcher bind:open={ui.tankSwitcher} tanks={data.tanks} currentId={data.currentTankId} onpick={pickTank} />

{#if showTabs}<InstallPrompt />{/if}

{#key ui.toast?.id}
	<Toast message={ui.toast?.text} undo={ui.toast?.undo} raised={showTabs} />
{/key}

<style>
	.shell {
		min-height: 100dvh;
	}
	.sidebar,
	.topbar {
		display: none;
	}
	main {
		padding-top: env(safe-area-inset-top);
	}
	main.with-tabs {
		padding-bottom: calc(110px + env(safe-area-inset-bottom));
	}
	.spacer {
		flex: 1;
	}
	.offline {
		margin: calc(8px + env(safe-area-inset-top)) 20px 0;
		padding: 10px 14px;
		border-radius: 14px;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		color: var(--warn-text);
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
	}
	.offline strong {
		font-size: 14px;
	}
	.fullscreen .sidebar,
	.fullscreen .topbar {
		display: none !important;
	}

	/* ── Phone tab bar + FAB ─────────────────────────────────────────── */
	.fab {
		position: fixed;
		right: 20px;
		bottom: calc(104px + env(safe-area-inset-bottom));
		width: 64px;
		height: 64px;
		border-radius: 32px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 34px;
		line-height: 1;
		box-shadow: var(--shadow-fab);
		z-index: 20;
	}
	.fab:active {
		transform: scale(0.94);
	}
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(88px + env(safe-area-inset-bottom));
		padding: 10px 0 env(safe-area-inset-bottom);
		background: var(--surface-2);
		border-top: 1px solid var(--border);
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		z-index: 20;
	}
	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--text-muted);
		--c: var(--text-muted);
	}
	.tabbar a.active {
		color: var(--accent);
		font-weight: 600;
		--c: var(--accent);
	}
	.ti {
		display: block;
		box-sizing: border-box;
	}
	.ti-dash {
		width: 22px;
		height: 22px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3px;
	}
	.ti-dash i {
		border: 2px solid var(--c);
		border-radius: 2px;
	}
	.active .ti-dash i {
		background: var(--c);
	}
	.ti-tanks {
		width: 24px;
		height: 20px;
		border: 2px solid var(--c);
		border-radius: 4px;
	}
	.active .ti-tanks {
		background: var(--c);
	}
	.ti-tasks {
		width: 22px;
		height: 22px;
		border: 2px solid var(--c);
		border-radius: 11px;
	}
	.active .ti-tasks {
		background: var(--c);
	}
	.ti-settings {
		width: 22px;
		height: 22px;
		border: 2px solid var(--c);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ti-settings i {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--c);
	}

	/* ── Desktop ─────────────────────────────────────────────────────── */
	@media (min-width: 1024px) {
		.shell {
			display: flex;
		}
		.fab,
		.tabbar {
			display: none;
		}
		main.with-tabs {
			padding-bottom: 0;
		}
		.sidebar {
			display: flex;
			flex-direction: column;
			gap: 28px;
			width: 232px;
			flex-shrink: 0;
			position: sticky;
			top: 0;
			height: 100dvh;
			overflow-y: auto;
			background: var(--surface-2);
			border-right: 1px solid var(--border);
			padding: 22px 16px;
		}
		.brand {
			padding: 0 8px;
			color: var(--text);
		}
		.nav {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.nav a,
		.settings {
			height: 40px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: 15px;
			color: var(--text-2);
		}
		.nav a:hover,
		.settings:hover {
			background: var(--surface);
		}
		.nav a.active,
		.settings.active {
			background: var(--selected);
			color: var(--accent);
			font-weight: 600;
		}
		.pill-bad {
			font-size: 12px;
			font-weight: 700;
			background: var(--bad-bg);
			color: var(--bad-text);
			padding: 2px 8px;
			border-radius: 10px;
			white-space: nowrap;
		}
		.pill-bad.sm {
			font-size: 11px;
			padding: 2px 7px;
		}
		.tank-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.caps {
			font-size: 12px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--text-faint);
			padding: 0 12px;
		}
		.tank {
			height: 44px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 14px;
			color: var(--text-2);
		}
		.tank:hover {
			color: var(--text);
			background: var(--surface);
		}
		.tank.current {
			background: var(--surface-hi);
			color: var(--text);
			font-weight: 600;
		}
		.tname {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.good {
			font-size: 11px;
			font-weight: 600;
			color: var(--ok);
			white-space: nowrap;
		}
		.main {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
		}
		.topbar {
			display: flex;
			align-items: center;
			gap: 16px;
			height: 72px;
			padding: 0 32px;
			border-bottom: 1px solid var(--border);
		}
		.tank-btn {
			display: flex;
			align-items: center;
			gap: 16px;
			text-align: left;
		}
		.tb-text {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		.tb-name {
			font-size: 20px;
			font-weight: 600;
		}
		.caret {
			font-size: 13px;
			color: var(--text-muted);
		}
		.tb-sub,
		.tb-meta {
			font-size: 13px;
			color: var(--text-muted);
		}
		.tb-meta {
			font-size: 14px;
		}
		.plus {
			font-size: 20px;
			font-weight: 400;
		}
	}
</style>
