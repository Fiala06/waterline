// Is a newer Waterline out? The server (never the browser) reads the upstream
// repo's CHANGELOG.md on main, at most every 12 hours, in the background.
// The admin turns it off in Server settings (UPDATE_CHECK=off forces that);
// UPDATE_CHECK_URL points it at a fork's changelog.
import { env } from '$env/dynamic/private';
import { compareVersions, displayVersion, parseChangelog, VERSION, type Release } from '$lib/changelog';
import { getServerSettings } from './mail';
import { logger } from './log';

const SOURCE = 'https://raw.githubusercontent.com/Fiala06/waterline/main/CHANGELOG.md';
const EVERY_MS = 12 * 3_600_000;
/** after a failed check (offline, GitHub down), try again sooner */
const RETRY_MS = 3_600_000;

let last: { at: number; ok: boolean; releases: Release[] } | null = null;
let checking: Promise<void> | null = null;

/** The releases in a changelog that are newer than the running one, newest first. */
export function newerReleases(md: string, running = VERSION): Release[] {
	return parseChangelog(md)
		.filter((r) => compareVersions(r.version, running) > 0)
		.sort((a, b) => compareVersions(b.version, a.version));
}

/** Check now. A failure keeps what the last check found. */
export async function checkForUpdate(fetcher: typeof fetch = fetch, now = Date.now()) {
	try {
		const res = await fetcher(env.UPDATE_CHECK_URL || SOURCE, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const releases = newerReleases(await res.text());
		if (releases[0] && releases[0].version !== last?.releases[0]?.version) logger.info('update', `Waterline ${displayVersion(releases[0].version)} is available`);
		last = { at: now, ok: true, releases };
	} catch (e) {
		logger.debug('update', "Couldn't check for a new version", { error: e });
		last = { at: now, ok: false, releases: last?.releases ?? [] };
	}
}

export interface Update {
	/** "1.2" */
	version: string;
	/** every release since the running one, newest first */
	releases: Release[];
	/** the changelog on GitHub, to read in full */
	link: string;
}

/** A raw GitHub file's page: raw.githubusercontent.com/owner/repo/branch/path → github.com/owner/repo/blob/branch/path. */
export const pageOf = (raw: string) => raw.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/, 'https://github.com/$1/$2/blob/$3');

/** The project on GitHub: the repo the check reads from (a fork's, with UPDATE_CHECK_URL), else upstream's. */
export function projectPage() {
	const repo = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//.exec(env.UPDATE_CHECK_URL || SOURCE) ?? /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//.exec(SOURCE)!;
	return `https://github.com/${repo[1]}/${repo[2]}`;
}

/**
 * The newer release the last check found, if any. Never waits: when a check
 * is due it starts one in the background, and the next page shows its result.
 */
export function availableUpdate(now = Date.now()): Update | null {
	if (env.UPDATE_CHECK === 'off' || !getServerSettings().updateCheck) return null;
	const due = !last || now - last.at > (last.ok ? EVERY_MS : RETRY_MS);
	if (due && !checking) checking = checkForUpdate().finally(() => (checking = null));
	const releases = last?.releases ?? [];
	return releases.length ? { version: displayVersion(releases[0].version), releases, link: pageOf(env.UPDATE_CHECK_URL || SOURCE) } : null;
}
