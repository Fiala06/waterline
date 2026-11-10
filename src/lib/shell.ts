// What each page is to the app shell (#262): which tank tab it sits under, whether
// it's a top-level page with the phone's header and bottom bar, its desktop
// title, and the Tank setup menu. The shell (src/routes/(app)/+layout.svelte)
// reads these and renders; a new page is one line here. Pure, so it's unit-tested.
import { IMPORTS, importKindOf } from './imports';

export type TabKey = 'overview' | 'charts' | 'history' | 'photos' | 'livestock' | 'plants' | 'equipment' | 'spending' | 'setup';

export interface RouteInfo {
	/** part of a tank's workspace (when a tank is chosen): the tank header and tabs */
	tankPage: boolean;
	/** the tab it sits under, if any */
	tab: TabKey | null;
	/** the tab's own page: no sub-page title under the tabs */
	tabPage: boolean;
	/** a top-level page: the phone header with the tank and its tabs */
	topLevel: boolean;
	/** the phone's bottom bar */
	phoneBar: boolean;
	/** a single photo, edge to edge */
	fullscreen: boolean;
	/** Log water test or another log form */
	logForm: boolean;
	/** picking another tank stays on this page (with ?tank=) instead of going to its Overview */
	keepOnTankChange: boolean;
	/** the desktop title, when it's fixed */
	title?: string;
}

const TANK = '/(app)/tanks/[id]';

type Flags = Partial<Omit<RouteInfo, 'title'>> & { title?: string };
const tabTop = (tab: TabKey): Flags => ({ tankPage: true, tab, tabPage: true, topLevel: true, phoneBar: true, keepOnTankChange: true });
const bar: Flags = { phoneBar: true, keepOnTankChange: false };

/** The app's pages outside /tanks/[id], one line each. */
const PAGES: Record<string, Flags> = {
	'/(app)': tabTop('overview'),
	'/(app)/charts': tabTop('charts'),
	'/(app)/history': tabTop('history'),
	'/(app)/photos': tabTop('photos'),
	'/(app)/photos/[id]': { tankPage: true, tab: 'photos', fullscreen: true },
	'/(app)/timeline': { tankPage: true, tab: 'photos', keepOnTankChange: true },
	'/(app)/entries/test/new': { tankPage: true, tab: 'history', logForm: true, keepOnTankChange: true },
	'/(app)/entries/event/new': { tankPage: true, tab: 'history', logForm: true, keepOnTankChange: true },
	'/(app)/entries/test/[id]': { tankPage: true, tab: 'history' },
	'/(app)/entries/test/[id]/edit': { tankPage: true, tab: 'history' },
	'/(app)/entries/event/[id]': { tankPage: true, tab: 'history' },
	'/(app)/entries/event/[id]/edit': { tankPage: true, tab: 'history' },
	'/(app)/more': { topLevel: true, phoneBar: true, keepOnTankChange: true },
	'/(app)/tasks': { ...bar, keepOnTankChange: true },
	'/(app)/tanks': bar,
	'/(app)/alerts': bar,
	'/(app)/settings': bar,
	'/(app)/calculators': bar
};

/** A tank's pages, by the path under /tanks/[id]: their fixed titles. */
const TANK_TITLES: Record<string, string> = {
	'(tabs)': 'Notes & routines',
	'equipment/new': 'Add equipment',
	'equipment/scan': 'Scan a barcode',
	'equipment/[eid]': 'Edit equipment',
	'equipment/[eid]/plug': 'Smart plug',
	health: 'Log health',
	'plants/health': 'Log plant health',
	algae: 'Log algae',
	'livestock/new': 'Add livestock',
	'livestock/several': 'Add several',
	'plants/several': 'Add several plants',
	remind: 'Remind me',
	pause: 'Pause tasks',
	plans: 'Treatment plans',
	'plans/new': 'Start a plan',
	review: 'Setup review',
	suggestions: 'Suggested steps',
	'spending/new': 'Add expense',
	'spending/[eid]': 'Edit expense',
	targets: 'Parameters & targets',
	public: 'Public page',
	sharing: 'Sharing',
	wishlist: 'Wish list',
	routines: 'Maintenance routines',
	'routines/[rid]/run': 'Run routine',
	summary: 'Share summary'
};

/** A tank page's tab, by the first part of its path: its own tabs, and Tank setup's pages. */
const TANK_TABS: Record<string, TabKey> = {
	livestock: 'livestock',
	plants: 'plants',
	equipment: 'equipment',
	spending: 'spending',
	settings: 'setup',
	targets: 'setup',
	public: 'setup',
	review: 'setup',
	suggestions: 'setup',
	remind: 'setup',
	import: 'setup',
	sharing: 'setup'
};

const NONE: RouteInfo = { tankPage: false, tab: null, tabPage: false, topLevel: false, phoneBar: false, fullscreen: false, logForm: false, keepOnTankChange: false };

/** What a route (SvelteKit's `page.route.id`) is to the shell. */
export function routeInfo(routeId: string | null | undefined): RouteInfo {
	const id = routeId ?? '';
	if (id === TANK || id.startsWith(`${TANK}/`)) {
		const rest = id.slice(TANK.length + 1);
		// the tab pages: /tanks/[id]/(tabs)/livestock…, and Notes & routines at /tanks/[id]
		const tabbed = rest.startsWith('(tabs)');
		const under = tabbed ? rest.slice('(tabs)'.length + 1) : rest;
		const own = tabbed && under !== '' && !under.includes('/');
		return {
			...NONE,
			tankPage: true,
			tab: rest === '(tabs)' ? 'setup' : (TANK_TABS[under.split('/')[0]] ?? null),
			tabPage: own,
			topLevel: tabbed && !under.includes('/'),
			phoneBar: tabbed && !under.includes('/'),
			title: TANK_TITLES[rest]
		};
	}
	const p = PAGES[id];
	return p ? { ...NONE, ...p } : NONE;
}

// ── The desktop title (crumbs, kicker, actions) of a page that isn't a tab ─────────

export interface Header {
	title: string;
	kicker?: string;
	crumbs?: { label: string; href: string }[];
	actions?: { label: string; href: string }[];
}

/** What a title can be made of, besides the route: the page's data and the shell's. */
export interface HeaderContext {
	data: Record<string, unknown>;
	params: Partial<Record<string, string>>;
	tanks: number;
	/** the tank on screen, if any */
	tankName: string | null;
	overdue: number;
	/** "3 new" and the like, for Alerts */
	alerts: string;
	/** where "+ New task" goes from Tasks, keeping its filters */
	newTaskHref: string;
	user: { displayName: string | null; email: string };
}

const TANKS = { label: 'Tanks', href: '/tanks' };
const TASKS = { label: 'Tasks', href: '/tasks' };

/** The desktop page title for a route, or null where the page has its own (a pet's hero, More). */
export function pageHeader(routeId: string | null | undefined, c: HeaderContext): Header | null {
	const id = routeId ?? '';
	const info = routeInfo(id);
	if (id === '/(app)/tanks') return { title: 'Tanks', kicker: `${c.tanks} active`, actions: [{ label: '+ Add tank', href: '/tanks/new' }] };
	if (id === '/(app)/tanks/new') return { title: 'Add tank', crumbs: [TANKS] };
	if (info.title) return { title: info.title };
	// a treatment plan (#177): its own name
	if (id === `${TANK}/plans/[rid]`) return { title: (c.data.run as { name?: string } | undefined)?.name ?? 'Plan' };
	if (id === `${TANK}/import/[list=importList]`) {
		const kind = importKindOf(c.params.list ?? '');
		return { title: kind ? IMPORTS[kind].title : 'Import' };
	}
	if (id === '/(app)/timeline') return { title: 'Timeline', kicker: 'Photos in date order, with the readings and stock of each moment' };
	if (id === '/(app)/calculators') return { title: 'Calculators', kicker: c.tankName ? `For ${c.tankName}` : 'Volume, water change, dosing, heater, substrate, CO₂' };
	if (id === '/(app)/tasks') return { title: 'Tasks', kicker: c.overdue ? `${c.overdue} overdue` : 'Every tank', actions: [{ label: '+ New task', href: c.newTaskHref }] };
	if (id === '/(app)/alerts') return { title: 'Alerts', kicker: c.alerts };
	const taskType = (c.data.values as { type?: string } | undefined)?.type;
	if (id === '/(app)/tasks/new') return { title: taskType === 'dosing' ? 'New dosing routine' : taskType === 'feeding' ? 'New feeding routine' : 'New task', crumbs: [TASKS] };
	if (id === '/(app)/tasks/[id]') return { title: taskType === 'dosing' || taskType === 'feeding' ? 'Edit routine' : 'Edit task', crumbs: [TASKS] };
	if (id.startsWith('/(app)/entries/') && !info.logForm) {
		return { title: id.endsWith('/edit') ? 'Edit entry' : ((c.data.entry as { kindLabel?: string } | undefined)?.kindLabel ?? 'Entry') };
	}
	if (id.startsWith('/(app)/settings')) return { title: 'Settings', kicker: [c.user.displayName, c.user.email].filter(Boolean).join(' · ') };
	return null;
}

// ── Tank setup's menu: the desktop's side nav, and the list on the phone's Tank setup page ──

export interface SetupItem {
	key: 'details' | 'targets' | 'public' | 'sharing' | 'remind' | 'notes' | 'review' | 'suggestions';
	label: string;
	/** under /tanks/<id>: '' for Notes & routines at /tanks/<id> itself */
	path: string;
	/** the route it is, to mark it as the page on screen */
	route: string;
}

export const SETUP_NAV: readonly SetupItem[] = [
	{ key: 'details', label: 'Details', path: 'settings', route: `${TANK}/(tabs)/settings` },
	{ key: 'targets', label: 'Parameters & targets', path: 'targets', route: `${TANK}/targets` },
	{ key: 'public', label: 'Public page', path: 'public', route: `${TANK}/public` },
	{ key: 'sharing', label: 'Sharing', path: 'sharing', route: `${TANK}/sharing` },
	{ key: 'remind', label: 'Remind me', path: 'remind', route: `${TANK}/remind` },
	{ key: 'notes', label: 'Notes & routines', path: '', route: `${TANK}/(tabs)` },
	{ key: 'review', label: 'Setup review', path: 'review', route: `${TANK}/review` },
	{ key: 'suggestions', label: 'Suggested steps', path: 'suggestions', route: `${TANK}/suggestions` }
];

/** A setup page's address for a tank. */
export const setupHref = (tankId: string, item: Pick<SetupItem, 'path'>) => `/tanks/${tankId}${item.path ? `/${item.path}` : ''}`;
