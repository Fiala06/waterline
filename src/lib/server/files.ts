// Files beside the database (#118): photos, receipts, avatars. Written and
// removed without blocking the server, in a set order around the database:
// - writing: the files first, then the rows; if a file can't be written,
//   the ones already written go and nothing is saved, and if the rows can't
//   be saved, the new files go too (writeThen)
// - removing: the rows first, then the files; a file left behind can't be
//   reached, so one that can't be removed is noted in the log, not an error
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { logger, type LogArea } from './log';

/** Write each file, making its folder; all or none. */
export async function writeAll(files: [path: string, data: Uint8Array][]): Promise<void> {
	const done: string[] = [];
	try {
		for (const dir of new Set(files.map(([p]) => dirname(p)))) await mkdir(dir, { recursive: true });
		for (const [path, data] of files) {
			await writeFile(path, data);
			done.push(path);
		}
	} catch (e) {
		await Promise.all(done.map((p) => rm(p, { force: true }).catch(() => {})));
		throw e;
	}
}

/** Write the files, then run `save` (the rows); if `save` throws, the files go and it rethrows. */
export async function writeThen<T>(files: [path: string, data: Uint8Array][], save: () => T): Promise<T> {
	await writeAll(files);
	try {
		return save();
	} catch (e) {
		await Promise.all(files.map(([p]) => rm(p, { force: true }).catch(() => {})));
		throw e;
	}
}

/** Replace a file kept under the same name: written beside it, then renamed over it, so it's never half there. */
export async function replaceFile(path: string, data: Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
	try {
		await writeFile(tmp, data);
		await rename(tmp, path);
	} catch (e) {
		await rm(tmp, { force: true }).catch(() => {});
		throw e;
	}
}

/** Remove files whose rows are already gone. Never throws: a failure is logged for the admin. */
export async function removeFiles(paths: string[], area: LogArea, opts: { recursive?: boolean } = {}): Promise<void> {
	await Promise.all(
		paths.map((p) =>
			rm(p, { force: true, recursive: opts.recursive ?? false }).catch((e) =>
				logger.warn(area, `Couldn't remove ${p}; it's no longer used and can be deleted`, { error: e })
			)
		)
	);
}
