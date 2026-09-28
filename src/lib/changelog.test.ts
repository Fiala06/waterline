import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { byLine, compareVersions, displayVersion, parseChangelog, RELEASES, VERSION, whatsNewCard } from './changelog';
import { isDate } from './time';

describe('parseChangelog', () => {
	it('reads each release and its lines, with the bold name kept', () => {
		const r = parseChangelog(
			[
				'# Changelog',
				'Some words about the file.',
				'## Unreleased',
				'- Not shown',
				'## 1.2.0 · 2026-10-01',
				'- **Pets:** name them,',
				'  and keep their photos.',
				'- **Import History** from a spreadsheet',
				'- A line without a name',
				'## 1.1.0 — 2026-09-27',
				'* One more'
			].join('\n')
		);
		expect(r.map((x) => [x.version, x.date, x.lines.length])).toEqual([
			['1.2.0', '2026-10-01', 3],
			['1.1.0', '2026-09-27', 1]
		]);
		expect(r[0].lines[0]).toEqual({
			parts: [
				{ text: 'Pets:', strong: true },
				{ text: ' name them, and keep their photos.', strong: false }
			],
			lead: 'Pets'
		});
		expect(r[0].lines[1].lead).toBe('Import History');
		expect(r[0].lines[2]).toEqual({ parts: [{ text: 'A line without a name', strong: false }], lead: null });
	});
});

describe('links in a line', () => {
	const [r] = parseChangelog(
		[
			'## 1.3.0 · 2026-10-02',
			'- **Calendar:** make a link in [Settings › Calendar](/settings#calendar), then see [the guide](https://example.com/help).',
			'- **Careful:** [elsewhere](//evil.example) and [script](javascript:alert(1)) stay text.'
		].join('\n')
	);
	it('keeps app pages and https links, and the first as the line\'s link', () => {
		expect(r.lines[0].parts).toEqual([
			{ text: 'Calendar:', strong: true },
			{ text: ' make a link in ', strong: false },
			{ text: 'Settings › Calendar', strong: false, href: '/settings#calendar' },
			{ text: ', then see ', strong: false },
			{ text: 'the guide', strong: false, href: 'https://example.com/help' },
			{ text: '.', strong: false }
		]);
		expect(r.lines[0].href).toBe('/settings#calendar');
		expect(r.lines[0].lead).toBe('Calendar');
	});
	it('turns any other link into plain text', () => {
		expect(r.lines[1].parts.every((p) => !p.href)).toBe(true);
		expect(r.lines[1].parts.map((p) => p.text).join('')).toBe('Careful: elsewhere and script) stay text.');
		expect(r.lines[1].href).toBeUndefined();
	});
});

describe('versions', () => {
	it('compares part by part', () => {
		expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
		expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
		expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
		expect(compareVersions('2.0', '1.9.9')).toBe(1);
	});

	it('drops a .0 patch for display', () => {
		expect(displayVersion('1.1.0')).toBe('1.1');
		expect(displayVersion('1.1.2')).toBe('1.1.2');
		expect(displayVersion('2.0.0')).toBe('2.0');
	});
});

describe('CHANGELOG.md', () => {
	it("has a release for the running version, first, and it's package.json's", () => {
		const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
		expect(VERSION).toBe(pkg.version);
		expect(RELEASES[0].version).toBe(VERSION);
	});

	it('lists releases newest first, each dated, with lines that have a name', () => {
		for (const [i, r] of RELEASES.entries()) {
			expect(isDate(r.date), r.version).toBe(true);
			expect(r.lines.length, r.version).toBeGreaterThan(0);
			expect(r.lines.every((l) => l.lead), r.version).toBe(true);
			if (i) {
				expect(compareVersions(RELEASES[i - 1].version, r.version)).toBe(1);
				expect(RELEASES[i - 1].date >= r.date).toBe(true);
			}
		}
	});

	it("shows What's new to someone who last saw an earlier version, once", () => {
		expect(whatsNewCard('1.0.0')?.version).toBe(displayVersion(VERSION));
		expect(whatsNewCard(VERSION)).toBeNull();
	});
});

describe("the dashboard's What's new card", () => {
	const releases = parseChangelog(`
## 1.5.1 · 2026-10-03
- **A fix:** in 1.5.1.
## 1.5.0 · 2026-10-02
- **Calendar:** in 1.5.0.
- **Also in 1.5:** more.
## 1.4.1 · 2026-10-01
- **Another fix:** in 1.4.1.
## 1.4.0 · 2026-09-30
- **Spending:** in [1.4.0](/tanks/current/spending).
## 1.3.0 · 2026-09-29
- **Old:** already seen.
`);

	it('is the one release when only that one is new', () => {
		expect(whatsNewCard('1.5.0', releases, '1.5.1')).toEqual({ version: '1.5.1', since: null, leads: [{ text: 'A fix', href: null }], more: 0 });
	});

	it('covers every release since the one last seen, feature releases first', () => {
		expect(whatsNewCard('1.3.0', releases, '1.5.1')).toEqual({
			version: '1.5.1',
			since: '1.3',
			leads: [
				{ text: 'Calendar', href: null },
				{ text: 'Also in 1.5', href: null },
				{ text: 'Spending', href: '/tanks/current/spending' }
			],
			// A fix, Another fix
			more: 2
		});
	});

	it('is nothing when all is seen, or after going back a version', () => {
		expect(whatsNewCard('1.5.1', releases, '1.5.1')).toBeNull();
		expect(whatsNewCard('2.0.0', releases, '1.5.1')).toBeNull();
	});
});

describe('byLine', () => {
	it('groups releases by their first two numbers, in order', () => {
		const rs = parseChangelog('## 1.4.1 · 2026-10-01\n- a\n## 1.4.0 · 2026-09-30\n- b\n## 1.3.0 · 2026-09-29\n- c\n## 1.10.0 · 2026-09-28\n- d');
		expect(byLine(rs).map((g) => [g.line, g.releases.map((r) => r.version)])).toEqual([
			['1.4', ['1.4.1', '1.4.0']],
			['1.3', ['1.3.0']],
			['1.10', ['1.10.0']]
		]);
	});
});

describe("CHANGELOG.md's links", () => {
	// every page and endpoint the app has, as patterns: [id] is one segment, [...rest] any
	const routes: RegExp[] = [];
	const walk = (dir: string, path: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.isDirectory()) {
				const seg = e.name.startsWith('(') ? '' : e.name.startsWith('[...') ? '/.*' : e.name.startsWith('[') ? '/[^/]+' : `/${e.name.replace(/[.]/g, '\\.')}`;
				walk(`${dir}/${e.name}`, path + seg);
			} else if (/^\+(page\.svelte|server\.ts)$/.test(e.name)) routes.push(new RegExp(`^${path || '/'}$`));
		}
	};
	walk('src/routes', '');
	const links = [...readFileSync('CHANGELOG.md', 'utf8').matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);

	it('has links', () => expect(links.length).toBeGreaterThan(10));
	it.each(links)('%s is a page in the app', (href) => {
		const path = href.replace(/[?#].*$/, '').replace(/\/$/, '') || '/';
		expect(routes.some((r) => r.test(path))).toBe(true);
	});
});
