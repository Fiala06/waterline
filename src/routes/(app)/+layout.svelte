<script lang="ts">
	import { tankTypeLabel } from '$lib/types';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { flushQueue, refreshQueue } from '$lib/offline';
	import { listenForInstall } from '$lib/install.svelte';
	import { navigating, page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import TankMenu from '$lib/components/TankMenu.svelte';
	import TankSwitcher from '$lib/components/TankSwitcher.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { toast, ui } from '$lib/ui.svelte';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));

	// Phone tab bar on the top-level screens; forms are full screen.
	const tabRoutes = ['/', '/tanks', '/tasks', '/settings', '/history', '/charts', '/photos'];
	const showTabs = $derived(tabRoutes.includes(path));
	// The + button is for logging: on the tank screens and Tasks (03, 06), not on Tanks or Settings (09, 16).
	const fabRoutes = ['/', '/tasks', '/history', '/charts', '/photos'];
	const showFab = $derived(fabRoutes.includes(path));
	// The photo viewer is full screen, without the sidebar or header.
	const fullscreen = $derived(path.startsWith('/photos/'));
	// The log forms: a new water test or event for the current tank (05, 08, 14).
	const logForm = $derived(/^\/entries\/(test|event)\/new$/.test(path));
	// The header's tank switcher only on pages about the current tank; Tasks,
	// Tanks and Settings cover every tank.
	const tankScoped = $derived(path === '/' || logForm || /^\/(charts|history|photos)(\/|$)/.test(path));

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/tanks', label: 'Tanks' },
		{ href: '/tasks', label: 'Tasks' },
		{ href: '/history', label: 'History' },
		{ href: '/charts', label: 'Charts' },
		{ href: '/photos', label: 'Photos' }
	];
	const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
	// History, Charts and Photos open from the dashboard, so its tab stays lit there.
	const tabActive = (href: string) => (href === '/' ? path === '/' || /^\/(history|charts|photos)(\/|$)/.test(path) : isActive(href));

	// Desktop header (README → Navigation). The dashboard and log forms get the big tank
	// switcher (07, 08); History, Charts and Photos a title and a small switcher (D6, D7, 19);
	// every other page its title, under a breadcrumb when it belongs to another page (D3–D5, D9).
	const bigSwitcher = $derived(path === '/' || logForm);
	const sectionTitle = $derived(({ '/history': 'History', '/charts': 'Charts', '/photos': 'Photos' } as Record<string, string | undefined>)[path]);
	const tankName = $derived(
		(page.data.tankHead?.name ?? page.data.tank?.name ?? data.tanks.find((t) => t.id === page.params.id)?.name ?? 'Tank') as string
	);
	const newTaskHref = $derived.by(() => {
		const q = new URLSearchParams(page.url.searchParams);
		q.delete('edit');
		q.set('new', '');
		return `/tasks?${q}`;
	});
	type Header = { title: string; crumbs?: { label: string; href: string }[]; actions?: { label: string; href: string }[] };
	const header = $derived.by((): Header | null => {
		const id = page.route.id ?? '';
		const tanks = { label: 'Tanks', href: '/tanks' };
		const tasks = { label: 'Tasks', href: '/tasks' };
		if (id === '/(app)/tanks') return { title: 'Tanks', actions: [{ label: 'Add tank', href: '/tanks/new' }] };
		if (id === '/(app)/tanks/new') return { title: 'Add tank', crumbs: [tanks] };
		if (id.startsWith('/(app)/tanks/[id]/(tabs)')) return { title: tankName, crumbs: [tanks] };
		const tankPage = (
			{
				'/(app)/tanks/[id]/equipment/new': 'Add equipment',
				'/(app)/tanks/[id]/equipment/[eid]': 'Edit equipment',
				'/(app)/tanks/[id]/livestock/new': 'Add livestock',
				'/(app)/tanks/[id]/targets': 'Parameters & targets',
				'/(app)/tanks/[id]/public': 'Public page',
				'/(app)/tanks/[id]/summary': 'Summary for an AI assistant'
			} as Record<string, string | undefined>
		)[id];
		if (tankPage) return { title: tankPage, crumbs: [tanks, { label: tankName, href: `/tanks/${page.params.id}` }] };
		if (id === '/(app)/tanks/[id]/import/[list=importList]') {
			return { title: `Import ${page.params.list}`, crumbs: [tanks, { label: tankName, href: `/tanks/${page.params.id}` }] };
		}
		if (id === '/(app)/tasks') return { title: 'Tasks', actions: [{ label: 'New task', href: newTaskHref }] };
		if (id === '/(app)/tasks/new') return { title: 'New task', crumbs: [tasks] };
		if (id === '/(app)/tasks/[id]') return { title: 'Edit task', crumbs: [tasks] };
		if (id.startsWith('/(app)/entries/') && !logForm) {
			const history = { label: 'History', href: ui.prev?.startsWith('/history') ? ui.prev : '/history' };
			return { title: id.endsWith('/edit') ? 'Edit entry' : ((page.data.entry?.kindLabel as string | undefined) ?? 'Entry'), crumbs: [history] };
		}
		if (id.startsWith('/(app)/settings')) return { title: 'Settings' };
		return null;
	});

	function pickTank(id: string) {
		const u = new URL(page.url);
		u.searchParams.set('tank', id);
		u.searchParams.delete('task');
		const keepPage = tabRoutes.includes(u.pathname) || logForm;
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
		ui.userId = data.user.id;
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

	// The server sets data-theme on first load; keep it in step when the saved
	// theme changes without a full reload (e.g. saving Settings).
	$effect(() => {
		const theme = data.user.theme;
		const root = document.documentElement;
		if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
		else delete root.dataset.theme;
		// the browser bar color follows too (as themeColorMeta in hooks.server.ts)
		for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.remove();
		const bar = (content: string, media = '') => document.head.append(Object.assign(document.createElement('meta'), { name: 'theme-color', content, media }));
		if (theme !== 'light') bar('#0c1a1f', theme === 'dark' ? '' : '(prefers-color-scheme: dark)');
		if (theme !== 'dark') bar('#f4f7f6', theme === 'light' ? '' : '(prefers-color-scheme: light)');
	});

	// Server messages (after a redirect) and browser ones share one toast.
	$effect(() => {
		const f = data.flash;
		if (f) ui.toast = { text: f.text, id: f.id, undo: f.undo, view: f.view };
	});

	// Where an entry was opened from, so its Back link and Delete return there.
	// Forms and single photos aren't places to go back to.
	afterNavigate(({ from, to }) => {
		const f = from?.url;
		if (!f || f.pathname === to?.url.pathname) return;
		ui.prev = /^\/(entries|photos\/|setup)/.test(f.pathname) ? ui.prev : f.pathname + f.search;
	});

	// Skeleton while a page takes a moment to load (7.9); quick loads never show it.
	let slow = $state(false);
	$effect(() => {
		if (!navigating.to) {
			slow = false;
			return;
		}
		const t = setTimeout(() => (slow = true), 300);
		return () => clearTimeout(t);
	});

	// Desktop header dropdown (G12); phones use the bottom sheet.
	let tankMenu = $state(false);

	function onkeydown(e: KeyboardEvent) {
		if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && data.tanks.length) {
			e.preventDefault();
			if (tankScoped && matchMedia('(min-width: 1024px)').matches) tankMenu = !tankMenu;
			else ui.tankSwitcher = true;
			return;
		}
		if (e.key !== '+' || e.metaKey || e.ctrlKey) return;
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, dialog')) return;
		e.preventDefault();
		ui.quickAdd = true;
	}

</script>

<svelte:window {onkeydown} />

<div class="shell" class:fullscreen>
	<aside class="sidebar" aria-label="Main">
		<a class="brand" href="/"><Logo size={28} wordmark wordSize={19} fish /></a>
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
						<TankThumb cover={t.cover} size={22} radius={6} />
						<span class="tname">{t.name}</span>
						{#if t.alerts}
							<span class="pill-bad sm">{t.alerts} alert{t.alerts === 1 ? '' : 's'}</span>
						{:else if t.tested}
							<span class="good">All good</span>
						{:else}
							<span class="nodata">No data</span>
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
			{#if current && tankScoped && bigSwitcher}
				<div class="tank-pick">
					<button type="button" class="tank-btn" aria-expanded={tankMenu} onclick={() => (tankMenu = !tankMenu)}>
						<TankThumb cover={current.cover} size={40} radius={10} />
						<span class="tb-text">
							<span class="tb-name">{current.name} <span class="caret">{tankMenu ? '▴' : '▾'}</span></span>
							<span class="tb-sub">{tankTypeLabel(current.type)}{current.volume ? ` · ${current.volume}` : ''}</span>
						</span>
					</button>
					<TankMenu bind:open={tankMenu} tanks={data.tanks} currentId={data.currentTankId} onpick={pickTank} />
				</div>
			{:else if tankScoped && sectionTitle}
				<div class="h-left">
					<h1 class="h-title">{sectionTitle}</h1>
					{#if current}
						<div class="tank-pick">
							<button type="button" class="tank-mini" aria-expanded={tankMenu} aria-label="{current.name}, switch tank" onclick={() => (tankMenu = !tankMenu)}>
								{current.name} <span class="caret" aria-hidden="true">{tankMenu ? '▴' : '▾'}</span>
							</button>
							<TankMenu bind:open={tankMenu} tanks={data.tanks} currentId={data.currentTankId} onpick={pickTank} />
						</div>
					{/if}
				</div>
			{:else if header}
				<div class="h-left">
					{#if header.crumbs?.length}
						<nav class="crumbs" aria-label="Breadcrumb">
							{#each header.crumbs as c (c.href)}<a href={c.href}>{c.label}</a><span class="sep" aria-hidden="true">›</span>{/each}
						</nav>
					{/if}
					<h1 class="h-title">{header.title}</h1>
				</div>
			{/if}
			<div class="spacer"></div>
			{#if current && path === '/'}<span class="tb-meta">{data.quick.lastTest}</span>{/if}
			{#each header?.actions ?? [] as a (a.href)}<a class="btn h-action" href={a.href}>{a.label}</a>{/each}
			<button type="button" class="btn btn-primary" onclick={() => (ui.quickAdd = true)}>
				<span class="plus">+</span>Quick add
			</button>
		</header>

		{#if !ui.online || waiting}
			<div class="offline" role="status">
				<strong>{ui.online ? '' : 'Offline'}{!ui.online && waiting ? ' · ' : ''}{waiting ? `${waiting} entr${waiting === 1 ? 'y' : 'ies'} waiting` : ''}</strong>
				<span>{ui.online ? 'Syncing…' : waiting ? "Saved on this phone. They'll sync when you're back online." : "New entries are saved on this phone until you're back online."}</span>
			</div>
		{/if}
		<main class:with-tabs={showTabs} class:with-fab={showFab} aria-busy={slow}>
			{@render children()}
			{#if slow}
				<div class="skeleton" aria-hidden="true"><i class="sk-title"></i><i></i><i></i><i class="sk-short"></i></div>
			{/if}
		</main>
	</div>
</div>

{#if showFab}
	<button type="button" class="fab" aria-label="Quick add" onclick={() => (ui.quickAdd = true)}>+</button>
{/if}
{#if showTabs}
	<nav class="tabbar" aria-label="Main">
		<a href="/" class:active={tabActive('/')} aria-current={path === '/' ? 'page' : undefined}>
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
	<Toast message={ui.toast?.text} undo={ui.toast?.undo} view={ui.toast?.view} lift={showFab ? 'fab' : showTabs ? 'tabs' : 'none'} />
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
		position: relative;
		padding-top: env(safe-area-inset-top);
	}
	.skeleton {
		position: absolute;
		inset: 0;
		z-index: 5;
		background: var(--bg);
		padding: calc(16px + env(safe-area-inset-top)) 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.skeleton i {
		display: block;
		height: 96px;
		max-width: 720px;
		border-radius: 16px;
		background: var(--surface);
		animation: wl-pulse 1.4s ease-in-out infinite;
	}
	.skeleton .sk-title {
		height: 32px;
		width: 45%;
	}
	.skeleton .sk-short {
		width: 70%;
	}
	main.with-tabs {
		padding-bottom: calc(110px + env(safe-area-inset-bottom));
	}
	/* tab bar 88 + gap + the 64px + button, so the last row can scroll clear of it */
	main.with-fab {
		padding-bottom: calc(184px + env(safe-area-inset-bottom));
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
	/* Tablets get the phone layout in a centered column, not edge-to-edge cards. */
	@media (min-width: 700px) and (max-width: 1023px) {
		main {
			width: 100%;
			max-width: 720px;
			margin-inline: auto;
		}
		.offline {
			max-width: 680px;
			margin-inline: auto;
		}
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
		margin: 1px 0; /* same 22px box as the other icons, so the labels line up */
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
		main.with-tabs,
		main.with-fab {
			padding-bottom: 0;
		}
		.sidebar {
			display: flex;
			flex-direction: column;
			gap: 26px;
			width: 232px;
			flex-shrink: 0;
			position: sticky;
			top: 0;
			height: 100dvh;
			overflow-y: auto;
			background: var(--surface-2);
			border-right: 1px solid var(--border);
			padding: 22px 14px;
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
			height: 42px;
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
		.tank-pick {
			position: relative;
		}
		.h-left {
			display: flex;
			align-items: center;
			gap: 10px;
			min-width: 0;
		}
		.h-title {
			margin: 0;
			font-size: 22px;
			font-weight: 600;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.crumbs {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-shrink: 0;
			font-size: 15px;
			font-weight: 600;
		}
		.crumbs .sep {
			color: var(--accent);
		}
		.crumbs .sep:last-child {
			margin-right: 2px;
		}
		.tank-mini {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			min-height: 44px;
			padding: 0 4px;
			font-size: 15px;
			color: var(--text-muted);
		}
		.tank-mini:hover {
			color: var(--text);
		}
		.h-action {
			min-height: 44px;
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
