// Where share images are kept (see og.ts), and their tidying: a new file is
// made for every version or title of a page, so the old ones go by age (#213).
// One still in use is simply drawn again the next time it's asked for.
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

export const ogCacheDir = () => join(env.DATA_DIR ?? './data', 'og');
const KEEP_DAYS = 30;

/** Remove share images made more than 30 days ago (run by the scheduler). Gives how many went. */
export function pruneShareImages(now = Date.now()): number {
	let names: string[];
	try {
		names = readdirSync(ogCacheDir());
	} catch {
		return 0;
	}
	let removed = 0;
	for (const name of names) {
		const file = join(ogCacheDir(), name);
		try {
			if (now - statSync(file).mtimeMs <= KEEP_DAYS * 86_400_000) continue;
			rmSync(file, { force: true });
			removed++;
		} catch {
			/* gone meanwhile */
		}
	}
	return removed;
}
