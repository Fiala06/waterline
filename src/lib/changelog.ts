// What's new, from CHANGELOG.md, bundled into the app at build time: it works
// offline and always matches the running version (package.json).
import changelog from '../../CHANGELOG.md?raw';
import { version } from '../../package.json';

/** One line of a release. `parts` keeps its **bold** name; `lead` is that name, for the dashboard's short list. */
export interface ChangeLine {
	parts: { text: string; strong: boolean }[];
	lead: string | null;
}
export interface Release {
	version: string;
	/** 'YYYY-MM-DD' */
	date: string;
	lines: ChangeLine[];
}

/** The running version, e.g. "1.1.0". */
export const VERSION: string = version;

/** Versions compared part by part: 1.10.0 is after 1.9.0. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return Math.sign(d);
	}
	return 0;
}

/** "1.1" for 1.1.0, "1.1.2" for 1.1.2. */
export const displayVersion = (v: string) => v.replace(/^(\d+\.\d+)\.0$/, '$1');

function lineOf(md: string): ChangeLine {
	const parts = md
		.split(/\*\*(.+?)\*\*/)
		.map((text, i) => ({ text, strong: i % 2 === 1 }))
		.filter((p) => p.text);
	return { parts, lead: parts[0]?.strong ? parts[0].text.replace(/:$/, '') : null };
}

/**
 * Releases from the changelog's text, as written: `## 1.1.0 · 2026-09-27`
 * headings, then `- ` lines (a line can wrap onto the next). Anything under
 * another heading, like `## Unreleased`, is left out.
 */
export function parseChangelog(md: string): Release[] {
	const releases: (Omit<Release, 'lines'> & { raw: string[] })[] = [];
	let current: (typeof releases)[number] | null = null;
	for (const text of md.split(/\r?\n/)) {
		const line = text.trim();
		if (line.startsWith('#')) {
			const h = /^##\s+(\d+\.\d+\.\d+)\s*[·—–-]\s*(\d{4}-\d{2}-\d{2})$/.exec(line);
			current = h ? { version: h[1], date: h[2], raw: [] } : null;
			if (current) releases.push(current);
		} else if (current && /^[-*]\s+/.test(line)) {
			current.raw.push(line.replace(/^[-*]\s+/, ''));
		} else if (current && line && current.raw.length) {
			current.raw[current.raw.length - 1] += ` ${line}`;
		}
	}
	return releases.map(({ raw, ...r }) => ({ ...r, lines: raw.map(lineOf) }));
}

/** Every release up to the running one, newest first. */
export const RELEASES: Release[] = parseChangelog(changelog)
	.filter((r) => compareVersions(r.version, VERSION) <= 0)
	.sort((a, b) => compareVersions(b.version, a.version));

/** The running version's release, when someone last saw an earlier one's: the dashboard's What's new card. */
export function whatsNewSince(seen: string): Release | null {
	if (compareVersions(VERSION, seen) <= 0) return null;
	return RELEASES.find((r) => r.version === VERSION) ?? null;
}
