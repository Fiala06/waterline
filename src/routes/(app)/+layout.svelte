<script lang="ts">
	// The app shell (redesign README → App shell): on desktop a sidebar of tanks
	// and app-wide links beside a tank workspace with its header and tabs; on
	// phones a header with the tank's name and a bottom bar with Log in the middle.
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import Sidebar from './Sidebar.svelte';
	import SyncBanner from './SyncBanner.svelte';
	import { CHART_RANGE_COOKIE, RANGE_COOKIE, remember, TANK_COOKIE } from '$lib/remember';
	import { CHART_RANGES } from '$lib/charts';
	import { RANGES } from '$lib/history';
	import { listenForInstall } from '$lib/install.svelte';
	import { navigating, page } from '$app/state';
	import { alertsKicker, unreadCount, updateAlert } from '$lib/alerts';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import ShortcutsSheet from '$lib/components/ShortcutsSheet.svelte';
	import TankHeader, { type Tab } from '$lib/components/TankHeader.svelte';
	import TankSwitcher from '$lib/components/TankSwitcher.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { logHref, toast, typing, ui } from '$lib/ui.svelte';
	import { pageHeader, routeInfo, setupHref, SETUP_NAV } from '$lib/shell';
	import { todayInZone } from '$lib/time';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
	const routeId = $derived(page.route.id ?? '');
	const current = $derived(data.tanks.find((t) => t.id === data.currentTankId));
	const today = $derived(todayInZone(data.user.timeZone));

	// ── Alerts (#195): the bell counts what's new since it was marked read (kept on the account) ──
	const alerts = $derived([...(data.app.update ? [updateAlert(data.app.update.version)] : []), ...data.alerts]);
	const unread = $derived(unreadCount(alerts, data.alertsSeen));

	// ── Where we are: what this page is to the shell (src/lib/shell.ts, #262) ──
	const info = $derived(routeInfo(routeId));
	// the tank workspace: Overview, Charts, History, Photos, the tank's tabs and its pages
	const tankScoped = $derived(!!current && info.tankPage);
	const tabs = $derived.by((): Tab[] => {
		if (!current) return [];
		const id = current.id;
		const base = `/tanks/${id}`;
		const list: Tab[] = [
			{ key: 'overview', label: 'Overview', href: `/?tank=${id}` },
			{ key: 'charts', label: 'Charts', href: `/charts?tank=${id}` },
			{ key: 'history', label: 'History', href: `/history?tank=${id}` },
			{ key: 'photos', label: 'Photos', href: `/photos?tank=${id}`, count: data.counts.photos },
			{ key: 'livestock', label: 'Livestock', href: `${base}/livestock`, count: data.counts.livestock },
			{ key: 'plants', label: 'Plants', href: `${base}/plants`, count: data.counts.plants },
			{ key: 'equipment', label: 'Equipment', href: `${base}/equipment`, count: data.counts.equipment },
			{ key: 'spending', label: 'Spending', href: `${base}/spending` },
			// Setup is the owner's (#22): a tank shared with you has no Setup tab
			...(current.role === 'owner' ? [{ key: 'setup', label: 'Tank setup', href: `${base}/settings` }] : [])
		].map((t) => ({ ...t, active: t.key === info.tab }));
		return list;
	});
	const setupTab = $derived(tabs.find((t) => t.key === 'setup')?.active ?? false);
	// the top-level tank pages: the phone header and bottom bar belong to these
	const topLevel = $derived(info.topLevel);
	const showBar = $derived(info.phoneBar);
	const fullscreen = $derived(info.fullscreen);

	const newTaskHref = $derived.by(() => {
		const q = new URLSearchParams(page.url.searchParams);
		q.delete('edit');
		q.set('new', '');
		return `/tasks?${q}`;
	});
	// Desktop sub-page heads (crumbs + title) for pages that aren't a tank tab.
	const header = $derived(
		pageHeader(routeId, {
			data: page.data as Record<string, unknown>,
			params: page.params,
			tanks: data.tanks.length,
			tankName: current?.name ?? null,
			overdue: data.overdueCount,
			alerts: alertsKicker(alerts.length, unread),
			newTaskHref,
			user: data.user
		})
	);
	// in the tank workspace, a sub-page's title sits under the tabs
	const subHead = $derived(tankScoped && header && !(info.tabPage && tabs.some((t) => t.active)) ? header : null);

	let sidebar: Sidebar | undefined = $state();
	function pickTank(id: string) {
		const u = new URL(page.url);
		u.searchParams.set('tank', id);
		u.searchParams.delete('task');
		goto(info.keepOnTankChange ? `${u.pathname}?${u.searchParams}` : `/?tank=${id}`);
	}

	onMount(() => {
		listenForInstall();
		// the service worker keeps pages for one person at a time (#108)
		navigator.serviceWorker?.ready.then((r) => r.active?.postMessage({ type: 'user', id: data.user.id })).catch(() => {});
		try {
			const t = sessionStorage.getItem('wl_toast');
			if (t) {
				sessionStorage.removeItem('wl_toast');
				toast(t);
			}
		} catch {
			/* storage blocked */
		}
	});

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
	// The tank and History range a page was opened with are remembered once it's really
	// on screen (#223), never when its data was only fetched ahead for a link under the mouse.
	afterNavigate(({ to }) => {
		if (!to) return;
		const tank = to.url.searchParams.get('tank') ?? (to.route.id?.startsWith('/(app)/tanks/[id]') ? to.params?.id : null);
		if (tank && tank === data.currentTankId) remember(TANK_COOKIE, tank);
		const range = to.url.pathname === '/history' ? to.url.searchParams.get('range') : null;
		if (range && RANGES.some((r) => r.key === range)) remember(RANGE_COOKIE, range);
		const chartRange = to.url.pathname === '/charts' ? to.url.searchParams.get('r') : null;
		if (chartRange && CHART_RANGES.some((r) => r.key === chartRange)) remember(CHART_RANGE_COOKIE, chartRange);
	});

	// The shell's data (alerts, overdue counts, the tank list) isn't fetched again on every page
	// any more (#242): back on the app after a while, it is, so the badges don't go stale.
	let shellAt = Date.now();
	$effect(() => {
		// a new list only when the shell's load ran again
		void data.alerts;
		shellAt = Date.now();
	});
	onMount(() => {
		const back = () => {
			if (document.visibilityState === 'visible' && Date.now() - shellAt > 5 * 60_000) invalidate('app:shell');
		};
		document.addEventListener('visibilitychange', back);
		const every = setInterval(() => document.visibilityState === 'visible' && Date.now() - shellAt > 5 * 60_000 && invalidate('app:shell'), 60_000);
		return () => {
			document.removeEventListener('visibilitychange', back);
			clearInterval(every);
		};
	});

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

	// A save that's refused (#261): the first field it refused gets the focus, so its
	// error isn't left off screen far up a long form. Without scripts, once the page is up.
	$effect(() => {
		if (!page.form) return;
		tick().then(() => {
			const field = [...document.querySelectorAll<HTMLElement>('main [aria-invalid="true"], dialog[open] [aria-invalid="true"]')].find((el) => el.getClientRects().length);
			if (!field || field.contains(document.activeElement)) return;
			field.focus({ preventScroll: true });
			field.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		});
	});

	// ── Keyboard (README → Global overlays): ignored while typing in a field ──
	let goPending = $state(false);
	let goTimer: ReturnType<typeof setTimeout> | undefined;
	const shown = (el: Element) => !el.closest('dialog:not([open]), [popover]:not(:popover-open), [hidden], [inert]');
	const primary = (f: HTMLFormElement) =>
		f.querySelector<HTMLButtonElement>('button.btn-primary:not([type]), button.btn-primary[type="submit"]') ?? undefined;
	function saveOpenForm(): boolean {
		const active = document.activeElement;
		let form: HTMLFormElement | null | undefined =
			active instanceof HTMLButtonElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement
				? active.form
				: active?.closest('form');
		// focus outside a form: only a page's own form that asks for it (a log form, one with a
		// FormBar), never the first Done or Mark as cycling on the page (#332)
		if (!form)
			form = [...document.querySelectorAll('main [data-save-shortcut]')]
				.map((el) => (el instanceof HTMLFormElement ? el : el.closest('form')))
				.find((f): f is HTMLFormElement => !!f && f.method === 'post' && !!primary(f) && shown(f));
		if (!form || !shown(form)) return false;
		// with a sheet or the palette open, never the form behind it
		const open = [...document.querySelectorAll('dialog[open]')];
		if (open.length && !open.some((d) => d.contains(form))) return false;
		const submitter = primary(form);
		if (submitter?.disabled) return true;
		form.requestSubmit(submitter);
		return true;
	}
	function onkeydown(e: KeyboardEvent) {
		const k = e.key;
		if ((k === 'k' || k === 'K') && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			ui.palette = !ui.palette;
			return;
		}
		// ⌘↵ / Ctrl+Enter: save the form you're in, or the page's main form (#257)
		if (k === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.isComposing) {
			if (saveOpenForm()) e.preventDefault();
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
			// G then N: the Alerts page (#195)
			if (k.toLowerCase() === 'n') {
				e.preventDefault();
				goto('/alerts');
				return;
			}
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
				sidebar?.togglePin();
				return;
			case '+':
				// Quick add logs: not for someone who can only view the tank (#344)
				if (current?.role === 'view') return;
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
		if (current && current.role !== 'view' && !e.shiftKey) {
			const kind = ({ t: 'test', w: 'water_change', d: 'dosing', n: 'note' } as const)[lower as 't' | 'w' | 'd' | 'n'];
			if (kind) {
				e.preventDefault();
				goto(logHref(kind, current.id));
			}
		}
	}
</script>

<svelte:window {onkeydown} {onscroll} />

<a class="skip" href="#main">Skip to content</a>
<div class="shell" class:fullscreen>
	<Sidebar {data} {tankScoped} {unread} {pickTank} bind:this={sidebar} />

	<div class="main">
		<SyncBanner {data} />

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
						{#each SETUP_NAV as s (s.key)}
							{@const on = routeId === s.route}
							<a href={setupHref(current.id, s)} class:active={on} aria-current={on ? 'page' : undefined}
								>{s.label}{s.key === 'sharing' && data.counts.members ? ` · ${data.counts.members}` : ''}</a
							>
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
	routines={data.routines}
/>
<TankSwitcher bind:open={ui.tankSwitcher} tanks={data.tanks} currentId={data.currentTankId} onpick={pickTank} />
<CommandPalette bind:open={ui.palette} tanks={data.tanks} currentTankId={data.currentTankId} favorites={data.favorites} routines={data.routines} onpick={pickTank} />
<ShortcutsSheet bind:open={ui.keys} />

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
	.caps {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* Tablets get the phone layout in a centered column. */
	@media (min-width: 700px) and (max-width: 1023px) {
		main {
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
