// A release of Waterline as What's new shows it (#349): the shapes and the
// small helpers the browser needs, apart from ./changelog, which holds the
// whole changelog and stays on the server.

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

/** "1.1" for 1.1.0, "1.1.2" for 1.1.2. */
export const displayVersion = (v: string) => v.replace(/^(\d+\.\d+)\.0$/, '$1');

/** Releases grouped by their first two numbers (1.4.0 to 1.4.4 are "1.4"), in order: What's new folds away older ones. */
export function byLine(releases: Release[]): { line: string; releases: Release[] }[] {
	const groups: { line: string; releases: Release[] }[] = [];
	for (const r of releases) {
		const line = r.version.split('.').slice(0, 2).join('.');
		if (groups.at(-1)?.line === line) groups.at(-1)!.releases.push(r);
		else groups.push({ line, releases: [r] });
	}
	return groups;
}
