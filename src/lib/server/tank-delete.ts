// Delete a tank for good (#304): only an archived one, only by its owner, with
// everything in it: entries, tasks and their reminders, photos and receipts on
// disk, its public page and photo links, and the backups built that hold it.
// Archive stays the reversible step; this is the one after it.
import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { join } from 'node:path';
import { db } from './db';
import { equipment, events, expenses, exports, livestock, photos, plants, publicPages, tankMembers, tanks, tasks, tests, type User } from './db/schema';
import { removeExportFiles } from './export';
import { removeFiles } from './files';
import { dataDir } from './instance';
import { logger } from './log';
import { getTank } from './tanks';

/** The archived tank of this owner's, or a 404/403/400 that says why not. */
function deletable(userId: string, tankId: string) {
	const tank = getTank(userId, tankId, 'owner');
	if (!tank.archivedAt) error(400, 'Archive the tank first: only an archived tank can be deleted.');
	return tank;
}

const n = (table: typeof tests | typeof events | typeof photos | typeof tasks | typeof livestock | typeof plants | typeof equipment, tankId: string) =>
	db.select({ n: count() }).from(table).where(eq(table.tankId, tankId)).get()?.n ?? 0;

/** What deleting the tank takes with it, for its page. */
export function tankFootprint(userId: string, tankId: string) {
	const tank = deletable(userId, tankId);
	const active = and(eq(tankMembers.tankId, tankId), isNotNull(tankMembers.userId), isNotNull(tankMembers.acceptedAt), isNull(tankMembers.revokedAt), isNull(tankMembers.leftAt));
	return {
		tank: { id: tank.id, name: tank.name },
		public: !!db.select({ on: publicPages.enabled }).from(publicPages).where(eq(publicPages.tankId, tankId)).get()?.on,
		tests: n(tests, tankId),
		entries: n(events, tankId),
		photos: n(photos, tankId),
		receipts: db.select({ n: count() }).from(expenses).where(and(eq(expenses.tankId, tankId), isNotNull(expenses.receiptPath))).get()?.n ?? 0,
		tasks: n(tasks, tankId),
		livestock: n(livestock, tankId),
		plants: n(plants, tankId),
		equipment: n(equipment, tankId),
		sharedWith: db.select({ n: count() }).from(tankMembers).where(active).get()?.n ?? 0
	};
}

/** Delete the archived tank, its files, and the backups built from it. Gives the tank's name. */
export async function deleteTank(user: User, tankId: string): Promise<string> {
	const tank = deletable(user.id, tankId);
	// the backups that hold it: this tank's, and the owner's whole-account ones
	const holding = or(and(eq(exports.scope, 'tank'), eq(exports.tankId, tankId)), and(eq(exports.scope, 'account'), eq(exports.userId, user.id)));
	if (db.select({ id: exports.id }).from(exports).where(and(holding, eq(exports.status, 'building'))).get())
		error(409, 'A backup is being built. Delete the tank once it has finished.');
	const built = db.select({ id: exports.id }).from(exports).where(holding).all().map((r) => r.id);
	db.transaction((tx) => {
		// whole-account backups made before stay listed, as expired (a tank's own go with it)
		if (built.length) tx.update(exports).set({ status: 'expired', filePath: null }).where(and(inArray(exports.id, built), eq(exports.status, 'ready'))).run();
		tx.delete(tanks).where(eq(tanks.id, tankId)).run(); // cascades to everything in it
	});
	removeExportFiles(built);
	await removeFiles([join(dataDir(), 'photos', tankId), join(dataDir(), 'receipts', tankId)], 'settings', { recursive: true });
	logger.info('settings', 'A tank was deleted for good', { userId: user.id, tankId });
	return tank.name;
}
