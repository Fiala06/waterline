import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareVersions, displayVersion, parseChangelog, RELEASES, VERSION, whatsNewSince } from './changelog';
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
		expect(whatsNewSince('1.0.0')?.version).toBe(VERSION);
		expect(whatsNewSince(VERSION)).toBeNull();
	});
});
