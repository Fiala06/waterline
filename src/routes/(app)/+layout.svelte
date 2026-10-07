<script lang="ts">
	// The app shell (redesign README → App shell): on desktop a sidebar of tanks
	// and app-wide links beside a tank workspace with its header and tabs; on
	// phones a header with the tank's name and a bottom bar with Log in the middle.
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import { flushQueue, refreshQueue } from '$lib/offline';
	import { listenForInstall } from '$lib/install.svelte';
	import { navigating, page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import AlertsPanel, { type Alert } from '$lib/components/AlertsPanel.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import ShortcutsSheet from '$lib/components/ShortcutsSheet.svelte';
	import TankHeader, { type Tab } from '$lib/components/TankHeader.svelte';
	import TankSwitcher from '$lib/components/TankSwitcher.svelte';
	import TankThumb from '$lib/components/TankThumb.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { logHref, toast, typing, ui } from '$lib/ui.svelte';
	import { IMPORTS, importKindOf } from '$lib/imports';
	import { todayInZone } from '$lib/time';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	const routeId = $derived(page.route.id ?? '');
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));
	const today = $derived(todayInZone(data.user.timeZone));

	// ── Where we are ──────────────────────────────────────────────────────
	// The tank workspace: Overview (/), Charts, History, Photos, the tank's tabs
	// and everything under /tanks/[id]; entries belong to History.
	const tankTabRoute = $derived(routeId.startsWith('/(app)/tanks/[id]/'));
	const tankScoped = $derived(
		!!current && (path === '/' || /^\/(charts|history|photos|timeline)(\/|$)/.test(path) || /^\/entries\//.test(path) || routeId.startsWith('/(app)/tanks/[id]'))
	);
	const logForm = $derived(/^\/entries\/(test|event)\/new$/.test(path));
	const tabs = $derived.by((): Tab[] => {
		if (!current) return [];
		const id = current.id;
		const base = `/tanks/${id}`;
		const under = (part: string) => routeId.startsWith(`/(app)/tanks/[id]/${part}`) || routeId.startsWith(`/(app)/tanks/[id]/(tabs)/${part}`);
		return [
			{ key: 'overview', label: 'Overview', href: `/?tank=${id}`, active: path === '/' },
			{ key: 'charts', label: 'Charts', href: `/charts?tank=${id}`, active: path.startsWith('/charts') },
			{ key: 'history', label: 'History', href: `/history?tank=${id}`, active: path.startsWith('/history') || path.startsWith('/entries/') },
			{ key: 'photos', label: 'Photos', href: `/photos?tank=${id}`, count: data.counts.photos, active: path.startsWith('/photos') || path === '/timeline' },
			{ key: 'livestock', label: 'Livestock', href: `${base}/livestock`, count: data.counts.livestock, active: under('livestock') },
			{ key: 'plants', label: 'Plants', href: `${base}/plants`, count: data.counts.plants, active: under('plants') },
			{ key: 'equipment', label: 'Equipment', href: `${base}/equipment`, count: data.counts.equipment, active: under('equipment') },
			{ key: 'spending', label: 'Spending', href: `${base}/spending`, active: under('spending') },
			// Setup is the owner's (#22): a tank shared with you has no Setup tab
			...(current.role === 'owner'
				? [
						{
							key: 'setup',
							label: 'Tank setup',
							href: `${base}/settings`,
							// Notes & routines (/tanks/[id]) is a Setup page too
							active: under('settings') || under('targets') || under('public') || under('review') || under('remind') || under('import') || under('sharing') || routeId === '/(app)/tanks/[id]/(tabs)'
						}
					]
				: [])
		];
	});
	const setupTab = $derived(tabs.find((t) => t.key === 'setup')?.active ?? false);
	// the top-level tank pages: the phone header and bottom bar belong to these
	const topLevel = $derived(
		path === '/' || /^\/(charts|history|photos|more)$/.test(path) || /^\/\(app\)\/tanks\/\[id\]\/\(tabs\)\/?[a-z]*$/.test(routeId)
	);
	const barRoutes = ['/tanks', '/tasks', '/settings', '/calculators'];
	const showBar = $derived(topLevel || barRoutes.includes(path));
	const fullscreen = $derived(path.startsWith('/photos/'));

	// Desktop sub-page heads (crumbs + title) for pages that aren't a tank tab.
	const tankName = $derived(
		(page.data.tankHead?.name ?? page.data.tank?.name ?? data.tanks.find((t) => t.id === page.params.id)?.name ?? 'Tank') as string
	);
	const newTaskHref = $derived.by(() => {
		const q = new URLSearchParams(page.url.searchParams);
		q.delete('edit');
		q.set('new', '');
		return `/tasks?${q}`;
	});
	type Header = { title: string; kicker?: string; crumbs?: { label: string; href: string }[]; actions?: { label: string; href: string }[] };
	const header = $derived.by((): Header | null => {
		const id = routeId;
		const tanks = { label: 'Tanks', href: '/tanks' };
		const tasks = { label: 'Tasks', href: '/tasks' };
		if (id === '/(app)/tanks') return { title: 'Tanks', kicker: `${data.tanks.length} active`, actions: [{ label: '+ Add tank', href: '/tanks/new' }] };
		if (id === '/(app)/tanks/new') return { title: 'Add tank', crumbs: [tanks] };
		const tankPage = (
			{
				'/(app)/tanks/[id]/(tabs)': 'Notes & routines',
				'/(app)/tanks/[id]/equipment/new': 'Add equipment',
				'/(app)/tanks/[id]/health': 'Log health',
				'/(app)/tanks/[id]/plants/health': 'Log plant health',
				'/(app)/tanks/[id]/algae': 'Log algae',
				'/(app)/tanks/[id]/equipment/[eid]': 'Edit equipment',
				'/(app)/tanks/[id]/livestock/new': 'Add livestock',
				'/(app)/tanks/[id]/livestock/several': 'Add several',
				'/(app)/tanks/[id]/plants/several': 'Add several plants',
				'/(app)/tanks/[id]/remind': 'Remind me',
				'/(app)/tanks/[id]/review': 'Setup review',
				'/(app)/tanks/[id]/spending/new': 'Add expense',
				'/(app)/tanks/[id]/spending/[eid]': 'Edit expense',
				'/(app)/tanks/[id]/targets': 'Parameters & targets',
				'/(app)/tanks/[id]/public': 'Public page',
				'/(app)/tanks/[id]/sharing': 'Sharing',
				'/(app)/tanks/[id]/wishlist': 'Wish list',
				'/(app)/tanks/[id]/summary': 'Share summary'
			} as Record<string, string | undefined>
		)[id];
		if (tankPage) return { title: tankPage };
		// a pet's page has its own name hero
		if (id === '/(app)/tanks/[id]/livestock/[lid]') return null;
		if (id === '/(app)/tanks/[id]/import/[list=importList]') {
			const kind = importKindOf(page.params.list ?? '');
			return { title: kind ? IMPORTS[kind].title : 'Import' };
		}
		if (id === '/(app)/timeline') return { title: 'Timeline', kicker: 'Photos in date order, with the readings and stock of each moment' };
		if (id === '/(app)/calculators') return { title: 'Calculators', kicker: current ? `For ${current.name}` : 'Volume, water change, dosing, heater, substrate, CO₂' };
		if (id === '/(app)/tasks') return { title: 'Tasks', kicker: data.overdueCount ? `${data.overdueCount} overdue` : 'Every tank', actions: [{ label: '+ New task', href: newTaskHref }] };
		const taskType = (page.data.values as { type?: string } | undefined)?.type;
		if (id === '/(app)/tasks/new')
			return { title: taskType === 'dosing' ? 'New dosing routine' : taskType === 'feeding' ? 'New feeding routine' : 'New task', crumbs: [tasks] };
		if (id === '/(app)/tasks/[id]') return { title: taskType === 'dosing' || taskType === 'feeding' ? 'Edit routine' : 'Edit task', crumbs: [tasks] };
		if (id.startsWith('/(app)/entries/') && !logForm) {
			return { title: id.endsWith('/edit') ? 'Edit entry' : ((page.data.entry?.kindLabel as string | undefined) ?? 'Entry') };
		}
		if (id.startsWith('/(app)/settings')) return { title: 'Settings', kicker: [data.user.displayName, data.user.email].filter(Boolean).join(' · ') };
		if (id === '/(app)/more') return null;
		return null;
	});
	// in the tank workspace, a sub-page's title sits under the tabs
	const subHead = $derived(tankScoped && header && !tabs.some((t) => t.active && (path === '/' || /^\/(charts|history|photos)$/.test(path) || /\/\(tabs\)\/[a-z]+$/.test(routeId))) ? header : null);

	// "1 reading out of range · 2 tasks overdue"
	function attentionText(t: { outOfRange: number; overdue: number }) {
		return [
			t.outOfRange ? `${t.outOfRange} reading${t.outOfRange === 1 ? '' : 's'} out of range` : null,
			t.overdue ? `${t.overdue} task${t.overdue === 1 ? '' : 's'} overdue` : null
		]
			.filter(Boolean)
			.join(' · ');
	}
	function pickTank(id: string) {
		const u = new URL(page.url);
		u.searchParams.set('tank', id);
		u.searchParams.delete('task');
		const keepPage = path === '/' || /^\/(charts|history|photos|timeline|tasks|more)$/.test(path) || logForm;
		goto(keepPage ? `${u.pathname}?${u.searchParams}` : `/?tank=${id}`);
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
	function togglePin() {
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

	// ── Alerts: what's new since they were last marked read (kept on the account) ──
	// what the server knows, plus what was just marked read here before the page refreshes
	let seenHere = $state<string[]>([]);
	const seen = $derived([...data.alertsSeen, ...seenHere]);
	const alerts = $derived.by((): Alert[] => {
		const list: Alert[] = data.alerts.map((a) => ({ key: a.key, kind: a.kind, title: a.title, sub: a.sub, href: a.href }));
		if (data.app.update) list.unshift({ key: `update:${data.app.update.version}`, kind: 'update', title: `Update to ${data.app.update.version}`, sub: "See what's new and update the server", href: '/settings/changelog' });
		return list;
	});
	const unread = $derived(alerts.filter((a) => !seen.includes(a.key)).length);
	function markRead(keys: string[]) {
		seenHere = [...new Set([...seenHere, ...keys])].slice(-300);
		fetch('/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys }) }).catch(() => {
			/* offline: the bell forgets on the next load */
		});
	}

	// ── Offline queue: sync when the connection comes back or the app is reopened ──
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
		// the service worker keeps pages for one person at a time (#108)
		navigator.serviceWorker?.ready.then((r) => r.active?.postMessage({ type: 'user', id: data.user.id })).catch(() => {});
		loadNav();
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
		if (theme !== 'light') bar('#161514', theme === 'dark' ? '' : '(prefers-color-scheme: dark)');
		if (theme !== 'dark') bar('#f3f2f2', theme === 'light' ? '' : '(prefers-color-scheme: light)');
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

	// ── Phone bar: out of the way while reading down a page, back on the way up ──
	let barHidden = $state(false);
	let lastY = 0;
	function onscroll() {
		const y = window.scrollY;
		if (y < 80 || y + innerHeight >= document.documentElement.scrollHeight - 8) barHidden = false;
		else if (Math.abs(y - lastY) > 6) barHidden = y > lastY;
		lastY = y;
	}
	afterNavigate(() => (barHidden = false));

	// ── Keyboard (README → Global overlays): ignored while typing in a field ──
	let goPending = $state(false);
	let goTimer: ReturnType<typeof setTimeout> | undefined;
	function onkeydown(e: KeyboardEvent) {
		const k = e.key;
		if ((k === 'k' || k === 'K') && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			ui.palette = !ui.palette;
			return;
		}
		if (typing(e) || e.metaKey || e.ctrlKey) return;
		if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown') && data.tanks.length > 1 && current) {
			e.preventDefault();
			const i = data.tanks.findIndex((t) => t.id === current.id);
			pickTank(data.tanks[(i + (k === 'ArrowDown' ? 1 : -1) + data.tanks.length) % data.tanks.length].id);
			return;
		}
		if (e.altKey) return;
		if (goPending) {
			goPending = false;
			clearTimeout(goTimer);
			const to = ({ o: 'overview', c: 'charts', h: 'history', p: 'photos', l: 'livestock', e: 'equipment', s: 'setup' } as Record<string, string | undefined>)[k.toLowerCase()];
			const tab = tabs.find((t) => t.key === to);
			if (tab) {
				e.preventDefault();
				goto(tab.href);
			}
			return;
		}
		switch (k) {
			case '/':
				e.preventDefault();
				ui.palette = true;
				return;
			case '?':
				e.preventDefault();
				ui.keys = true;
				return;
			case '[':
				e.preventDefault();
				togglePin();
				return;
			case '+':
				e.preventDefault();
				ui.quickAdd = true;
				return;
		}
		const lower = k.toLowerCase();
		if (lower === 'g' && current) {
			goPending = true;
			clearTimeout(goTimer);
			goTimer = setTimeout(() => (goPending = false), 1500);
			return;
		}
		if (current && !e.shiftKey) {
			const kind = ({ t: 'test', w: 'water_change', d: 'dosing', n: 'note' } as const)[lower as 't' | 'w' | 'd' | 'n'];
			if (kind) {
				e.preventDefault();
				goto(logHref(kind, current.id));
			}
		}
	}
	const footerLine = $derived(data.app.update ? `↑ Update to ${data.app.update.version}` : `Waterline v${data.app.version}`);
</script>

<svelte:window {onkeydown} {onscroll} />

<a class="skip" href="#main">Skip to content</a>
<div class="shell" class:fullscreen>
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
				<button type="button" class="link" class:active={ui.alerts} title="Alerts" onclick={() => (ui.alerts = true)}>
					<span class="ic"><Icon name="bell" />{#if unread}<span class="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>{/if}</span>
					<span class="lbl">Alerts</span>{#if unread}<span class="sr-only">{unread} unread</span>{/if}
				</button>
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

	<div class="main">
		{#if !ui.online || waiting}
			<div class="offline" role="status">
				<strong>{ui.online ? '' : 'Offline'}{!ui.online && waiting ? ' · ' : ''}{waiting ? `${waiting} entr${waiting === 1 ? 'y' : 'ies'} waiting` : ''}</strong>
				<span>{ui.online ? 'Syncing…' : waiting ? "Saved on this phone. They'll sync when you're back on dry land." : "New entries are saved on this phone until you're back on dry land."}</span>
			</div>
		{/if}

		{#if tankScoped && current}
			<div class:hide-phone={!topLevel}>
				<TankHeader
					tank={{ id: current.id, name: current.name, type: current.type, volume: current.volume, startDate: current.startDate, cover: current.cover, coverPos: current.coverPos }}
					role={current.role}
					lastTest={data.quick.lastTest}
					{today}
					{tabs}
					{unread}
					tabsOnPhone={topLevel}
				/>
			</div>
			{#if subHead}
				<div class="sub-head hide-phone"><h2>{subHead.title}</h2></div>
			{/if}
		{:else if header}
			<header class="page-head hide-phone">
				<div class="ph-text">
					{#if header.crumbs?.length}
						<nav class="crumbs" aria-label="Breadcrumb">
							{#each header.crumbs as c (c.href)}<a href={c.href}>{c.label}</a><span class="sep" aria-hidden="true">›</span>{/each}
						</nav>
					{:else if header.kicker}
						<span class="kicker">{header.kicker}</span>
					{/if}
					<h1>{header.title}</h1>
				</div>
				{#each header.actions ?? [] as a (a.href)}<a class="btn btn-primary" href={a.href}>{a.label}</a>{/each}
			</header>
		{/if}

		<main id="main" tabindex="-1" class:with-bar={showBar} class:setup={setupTab} aria-busy={slow}>
			{#if setupTab && current}
				<div class="setup-grid">
					<nav class="setup-nav hide-phone" aria-label="Tank setup">
						<span class="caps">Tank setup</span>
						{#each [
							{ href: `/tanks/${current.id}/settings`, label: 'Details', on: routeId.endsWith('/(tabs)/settings') },
							{ href: `/tanks/${current.id}/targets`, label: 'Parameters & targets', on: routeId.endsWith('/targets') },
							{ href: `/tanks/${current.id}/public`, label: 'Public page', on: routeId.endsWith('/public') },
							{ href: `/tanks/${current.id}/sharing`, label: `Sharing${data.counts.members ? ` · ${data.counts.members}` : ''}`, on: routeId.endsWith('/sharing') },
							{ href: `/tanks/${current.id}/remind`, label: 'Remind me', on: routeId.endsWith('/remind') },
							{ href: `/tanks/${current.id}`, label: 'Notes & routines', on: routeId === '/(app)/tanks/[id]/(tabs)' },
							{ href: `/tanks/${current.id}/review`, label: 'Setup review', on: routeId.endsWith('/review') }
						] as s (s.href)}
							<a href={s.href} class:active={s.on} aria-current={s.on ? 'page' : undefined}>{s.label}</a>
						{/each}
						<a class="archive" href="/tanks/{current.id}/settings#archive">Archive</a>
					</nav>
					<div class="setup-content">{@render children()}</div>
				</div>
			{:else}
				{@render children()}
			{/if}
			{#if slow}
				<div class="skeleton" aria-hidden="true"><i class="sk-title"></i><i></i><i></i><i class="sk-short"></i></div>
			{/if}
		</main>
	</div>
</div>

<!-- ── Phone bottom bar: Overview, Charts, Log, History, More ──────────── -->
{#if showBar}
	<nav class="tabbar" class:tucked={barHidden} aria-label="Main">
		<a href="/" class:active={path === '/'} aria-current={path === '/' ? 'page' : undefined}><Icon name="grid" size={22} />Overview</a>
		<a href="/charts" class:active={path === '/charts'} aria-current={path === '/charts' ? 'page' : undefined}><Icon name="chart" size={22} />Charts</a>
		{#if current?.role === 'view'}
			<span class="log viewer" aria-hidden="true"><span class="sq"><Icon name="grid" size={26} /></span><span>Viewing</span></span>
		{:else}
			<button type="button" class="log" aria-label="Log" onclick={() => (ui.quickAdd = true)}><span class="sq"><Icon name="plus" size={26} /></span><span>Log</span></button>
		{/if}
		<a href="/history" class:active={path === '/history'} aria-current={path === '/history' ? 'page' : undefined}><Icon name="clock" size={22} />History</a>
		<a href="/more" class:active={!['/', '/charts', '/history'].includes(path)} aria-current={path === '/more' ? 'page' : undefined}><Icon name="more" size={22} />More</a>
	</nav>
{/if}

<QuickAdd
	bind:open={ui.quickAdd}
	tanks={data.tanks}
	currentTankId={data.currentTankId}
	timeZone={data.user.timeZone}
	lastTest={data.quick.lastTest}
	wcDue={data.quick.wcDue}
	favorites={data.favorites}
/>
<TankSwitcher bind:open={ui.tankSwitcher} tanks={data.tanks} currentId={data.currentTankId} onpick={pickTank} />
<CommandPalette bind:open={ui.palette} tanks={data.tanks} currentTankId={data.currentTankId} favorites={data.favorites} onpick={pickTank} />
<ShortcutsSheet bind:open={ui.keys} />
<AlertsPanel bind:open={ui.alerts} {alerts} onread={markRead} />

{#if showBar}<InstallPrompt />{/if}

{#key ui.toast?.id}
	<Toast message={ui.toast?.text} undo={ui.toast?.undo} view={ui.toast?.view} lift={showBar ? 'tabs' : 'none'} />
{/key}

<style>
	.shell {
		min-height: 100dvh;
	}
	/* keyboard users jump past the menus; visible only while focused */
	.skip {
		position: fixed;
		top: 8px;
		left: 8px;
		z-index: 100;
		padding: 10px 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 800;
		transform: translateY(-200%);
	}
	.skip:focus {
		transform: none;
	}
	main:focus {
		outline: none;
	}
	.navslot,
	.page-head,
	.sub-head {
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
	/* the bottom bar (78px + the home indicator) and a little air */
	main.with-bar {
		padding-bottom: calc(100px + env(safe-area-inset-bottom));
	}
	.spacer {
		flex: 1;
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
	.fullscreen .navslot {
		display: none !important;
	}
	.caps {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* Tablets get the phone layout in a centered column. */
	@media (min-width: 700px) and (max-width: 1023px) {
		main,
		.offline {
			width: 100%;
			max-width: 720px;
			margin-inline: auto;
		}
	}

	/* ── Phone bottom bar ─────────────────────────────────────────────── */
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(78px + env(safe-area-inset-bottom));
		padding: 8px 0 env(safe-area-inset-bottom);
		background: var(--bg);
		border-top: 2px solid var(--ink);
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		z-index: 20;
		transition: transform 0.2s ease;
	}
	.tabbar.tucked {
		transform: translateY(100%);
	}
	.tabbar a,
	.tabbar .log {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text);
		min-height: 44px;
	}
	.tabbar a.active {
		color: var(--accent-text);
		font-weight: 800;
	}
	/* the active tab: a 3px accent bar on the bar's top edge */
	.tabbar a.active::before {
		content: '';
		position: absolute;
		top: -10px;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--accent);
	}
	/* Log: a 60px accent square, raised 18px over the bar */
	/* Log: the accent square raised over the bar, its label under it */
	.tabbar .log {
		margin-top: -22px;
		gap: 3px;
		justify-content: flex-start;
	}
	.tabbar .log .sq {
		width: 56px;
		height: 56px;
		background: var(--accent);
		color: var(--on-accent);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-md);
	}
	.tabbar .log .sq + span {
		font-size: 11px;
		font-weight: 800;
	}

	/* ── Desktop ─────────────────────────────────────────────────────── */
	@media (min-width: 1024px) {
		.shell {
			display: flex;
			min-width: 900px;
		}
		.tabbar {
			display: none;
		}
		main.with-bar {
			padding-bottom: 0;
		}
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

		.main {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
		}
		/* a page's title block (Tanks, Tasks, Settings, forms) */
		.page-head {
			display: flex;
			align-items: flex-end;
			justify-content: space-between;
			gap: 20px;
			margin: 28px 32px 0;
			padding-bottom: 16px;
			border-bottom: 2px solid var(--divider);
		}
		.ph-text {
			min-width: 0;
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.page-head h1 {
			margin: 0;
			font-size: 42px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.crumbs {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 13px;
			font-weight: 700;
		}
		.crumbs .sep {
			color: var(--text-muted);
		}
		.sub-head {
			display: block;
			margin: 24px 32px 0;
		}
		.sub-head h2 {
			margin: 0;
			font-size: 28px;
		}
		.offline {
			margin: 16px 32px 0;
		}
		/* Setup: a 200px nav, then the page (max 880) */
		.setup-grid {
			display: grid;
			grid-template-columns: 200px minmax(0, 1fr);
			min-height: 100%;
		}
		.setup-nav {
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 24px 12px 24px 32px;
			border-right: 2px solid var(--divider);
			position: sticky;
			top: 0;
			align-self: start;
		}
		.setup-nav .caps {
			padding: 0 8px 8px;
		}
		.setup-nav a {
			min-height: 40px;
			padding: 8px 8px;
			display: flex;
			align-items: center;
			font-size: 15px;
			color: var(--text);
		}
		@media (hover: hover) {
			.setup-nav a:hover {
				background: var(--surface);
			}
		}
		.setup-nav a.active {
			background: var(--surface);
			font-weight: 800;
		}
		.setup-nav .archive {
			margin-top: 12px;
			color: var(--bad);
		}
		.setup-content {
			min-width: 0;
			max-width: 880px;
		}
	}
</style>
