// What's new, from CHANGELOG.md, bundled into the app at build time: it works
// offline and always matches the running version (package.json).
import changelog from '../../CHANGELOG.md?raw';
import { version } from '../../package.json';

/**
 * One line of a release. `parts` keeps its **bold** name and its [links](/path);
 * `lead` is that name, and `href` the line's first link, for the dashboard's
 * short list.
 */
export interface ChangeLine {
	parts: { text: string; strong: boolean; href?: string }[];
	lead: string | null;
	href?: string;
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

/** A page in the app ("/settings#calendar", not "//elsewhere"), or a page on the web over https. */
export const safeHref = (href: string) => (/^\/(?!\/)/.test(href) || /^https:\/\//.test(href) ? href : null);

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;

function lineOf(md: string): ChangeLine {
	const parts: ChangeLine['parts'] = [];
	md.split(/\*\*(.+?)\*\*/).forEach((chunk, i) => {
		const strong = i % 2 === 1;
		// links within: [Settings › Calendar](/settings#calendar)
		let rest = chunk;
		for (let m = LINK.exec(rest); m; m = LINK.exec(rest)) {
			if (m.index) parts.push({ text: rest.slice(0, m.index), strong });
			const href = safeHref(m[2]);
			parts.push(href ? { text: m[1], strong, href } : { text: m[1], strong });
			rest = rest.slice(m.index + m[0].length);
		}
		if (rest) parts.push({ text: rest, strong });
	});
	const href = parts.find((p) => p.href)?.href;
	return { parts, lead: parts[0]?.strong ? parts[0].text.replace(/:$/, '') : null, ...(href ? { href } : {}) };
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
