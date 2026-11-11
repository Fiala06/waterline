import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageHeader, routeInfo, setupHref, SETUP_NAV, type HeaderContext, type TabKey } from './shell';

// Every page under src/routes/(app), as SvelteKit names its route.
const ROOT = 'src/routes';
function pages(dir = join(ROOT, '(app)')): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...pages(p));
		else if (name === '+page.svelte') out.push('/' + relative(ROOT, dir).split('\\').join('/'));
	}
	return out;
}
const ROUTES = pages();

/** A path that route would be opened at. */
const pathOf = (id: string) =>
	id
		.replace('/(app)', '')
		.replace('/(tabs)', '')
		.replace('[list=importList]', 'livestock')
		.replace('[...rest]', 'x')
		.replace(/\[\w+\]/g, 'abc') || '/';

// The shell's rules before #262, kept here to show the table changes nothing.
function before(routeId: string) {
	const path = pathOf(routeId);
	const under = (part: string) => routeId.startsWith(`/(app)/tanks/[id]/${part}`) || routeId.startsWith(`/(app)/tanks/[id]/(tabs)/${part}`);
	const tabs: [TabKey, boolean][] = [
		['overview', path === '/'],
		['charts', path.startsWith('/charts')],
		['history', path.startsWith('/history') || path.startsWith('/entries/')],
		['photos', path.startsWith('/photos') || path === '/timeline'],
		['livestock', under('livestock')],
		['plants', under('plants')],
		['equipment', under('equipment')],
		['spending', under('spending')],
		['setup', under('settings') || under('targets') || under('public') || under('review') || under('suggestions') || under('remind') || under('import') || under('sharing') || routeId === '/(app)/tanks/[id]/(tabs)']
	];
	const topLevel = path === '/' || /^\/(charts|history|photos|more)$/.test(path) || /^\/\(app\)\/tanks\/\[id\]\/\(tabs\)\/?[a-z]*$/.test(routeId);
	const logForm = /^\/entries\/(test|event)\/new$/.test(path);
	return {
		tankPage: path === '/' || /^\/(charts|history|photos|timeline)(\/|$)/.test(path) || /^\/entries\//.test(path) || routeId.startsWith('/(app)/tanks/[id]'),
		tab: tabs.find(([, on]) => on)?.[0] ?? null,
		tabPage: path === '/' || /^\/(charts|history|photos)$/.test(path) || /\/\(tabs\)\/[a-z]+$/.test(routeId),
		topLevel,
		phoneBar: topLevel || ['/tanks', '/tasks', '/alerts', '/settings', '/calculators'].includes(path),
		fullscreen: path.startsWith('/photos/'),
		logForm,
		keepOnTankChange: path === '/' || /^\/(charts|history|photos|timeline|tasks|more)$/.test(path) || logForm
	};
}

const ctx: HeaderContext = {
	data: {},
	params: {},
	tanks: 3,
	tankName: 'Riverbed 40',
	overdue: 2,
	alerts: '1 new',
	newTaskHref: '/tasks?new=',
	user: { displayName: 'Cory', email: 'cory@example.com' }
};

describe('what each page is to the shell (#262)', () => {
	it('finds the pages', () => {
		expect(ROUTES).toContain('/(app)');
		expect(ROUTES).toContain('/(app)/tanks/[id]/(tabs)/livestock');
		expect(ROUTES.length).toBeGreaterThan(50);
	});

	it.each(ROUTES)('%s: the same as the shell decided before', (id) => {
		const { title, ...flags } = routeInfo(id);
		void title;
		expect(flags).toEqual(before(id));
	});

	it('gives every tank sub-page that is not a tab a title (or its own hero)', () => {
		const own = ['/(app)/tanks/[id]/livestock/[lid]'];
		for (const id of ROUTES.filter((r) => r.startsWith('/(app)/tanks/[id]/') && !routeInfo(r).tabPage && !own.includes(r))) {
			expect(pageHeader(id, ctx)?.title, id).toBeTruthy();
		}
		expect(pageHeader('/(app)/tanks/[id]/livestock/[lid]', ctx)).toBeNull();
	});

	it('knows nothing of a route that is not a page', () => {
		expect(routeInfo(null)).toMatchObject({ tankPage: false, tab: null, phoneBar: false });
		expect(routeInfo('/(app)/nowhere').title).toBeUndefined();
	});
});

describe('desktop page titles', () => {
	it('fixed ones, and ones from the page or the shell', () => {
		expect(pageHeader('/(app)/tanks', ctx)).toEqual({ title: 'Tanks', kicker: '3 active', actions: [{ label: '+ Add tank', href: '/tanks/new' }] });
		expect(pageHeader('/(app)/tanks/new', ctx)).toEqual({ title: 'Add tank', crumbs: [{ label: 'Tanks', href: '/tanks' }] });
		expect(pageHeader('/(app)/tanks/[id]/targets', ctx)?.title).toBe('Parameters & targets');
		expect(pageHeader('/(app)/tanks/[id]/(tabs)', ctx)?.title).toBe('Notes & routines');
		expect(pageHeader('/(app)/tanks/[id]/plans/[rid]', { ...ctx, data: { run: { name: 'Ich treatment' } } })?.title).toBe('Ich treatment');
		expect(pageHeader('/(app)/tanks/[id]/plans/[rid]', ctx)?.title).toBe('Plan');
		expect(pageHeader('/(app)/tanks/[id]/import/[list=importList]', { ...ctx, params: { list: 'nope' } })?.title).toBe('Import');
		expect(pageHeader('/(app)/calculators', ctx)?.kicker).toBe('For Riverbed 40');
		expect(pageHeader('/(app)/calculators', { ...ctx, tankName: null })?.kicker).toBe('Volume, water change, dosing, heater, substrate, CO₂');
		expect(pageHeader('/(app)/tasks', ctx)).toMatchObject({ kicker: '2 overdue', actions: [{ href: '/tasks?new=' }] });
		expect(pageHeader('/(app)/tasks', { ...ctx, overdue: 0 })?.kicker).toBe('Every tank');
		expect(pageHeader('/(app)/alerts', ctx)?.kicker).toBe('1 new');
		expect(pageHeader('/(app)/tasks/new', { ...ctx, data: { values: { type: 'dosing' } } })?.title).toBe('New dosing routine');
		expect(pageHeader('/(app)/tasks/new', ctx)?.title).toBe('New task');
		expect(pageHeader('/(app)/tasks/[id]', { ...ctx, data: { values: { type: 'feeding' } } })?.title).toBe('Edit routine');
		expect(pageHeader('/(app)/entries/test/[id]/edit', ctx)?.title).toBe('Edit entry');
		expect(pageHeader('/(app)/entries/event/[id]', { ...ctx, data: { entry: { kindLabel: 'Water change' } } })?.title).toBe('Water change');
		expect(pageHeader('/(app)/entries/test/new', ctx)).toBeNull();
		expect(pageHeader('/(app)/settings/products', ctx)).toEqual({ title: 'Settings', kicker: 'Cory · cory@example.com' });
		expect(pageHeader('/(app)/more', ctx)).toBeNull();
		expect(pageHeader('/(app)', ctx)).toBeNull();
	});
});

describe('Tank setup’s menu', () => {
	it('lists each setup page once, at its own route', () => {
		expect(SETUP_NAV.map((s) => s.label)).toEqual(['Details', 'Parameters & targets', 'Public page', 'Sharing', 'Remind me', 'Notes & routines', 'Setup review', 'Suggested steps']);
		for (const s of SETUP_NAV) {
			expect(ROUTES, s.label).toContain(s.route);
			expect(routeInfo(s.route).tab, s.label).toBe('setup');
		}
		expect(setupHref('t1', SETUP_NAV[0])).toBe('/tanks/t1/settings');
		expect(setupHref('t1', SETUP_NAV.find((s) => s.key === 'notes')!)).toBe('/tanks/t1');
	});
});
