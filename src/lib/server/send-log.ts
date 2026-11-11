// What has been sent to whom (email_log), so nothing goes twice, and what to do
// when a send fails (#232). A failed email or push keeps its row and is tried
// again later, each wait twice the one before, and given up after a few tries,
// with one line in the log to say so, rather than every five minutes for good.
import { and, eq, lte } from 'drizzle-orm';
import { db } from './db';
import { emailLog } from './db/schema';
import { logger, type LogArea } from './log';

/** Tries in all, the first included. */
export const MAX_ATTEMPTS = 6;
const FIRST_WAIT_MS = 15 * 60_000;
const LONGEST_WAIT_MS = 4 * 3_600_000;

/** How long after the `attempts`th failed try the next one is due: 15 min, 30, 1 h, 2, 4, 4… */
export const retryWait = (attempts: number) => Math.min(FIRST_WAIT_MS * 2 ** Math.max(attempts - 1, 0), LONGEST_WAIT_MS);

const where = (userId: string, key: string) => and(eq(emailLog.userId, userId), eq(emailLog.key, key));

/**
 * Whether this run should send `key` to this person: never tried, or a retry
 * that's due. The row is claimed before sending, so two runs never both send.
 */
export function claimSend(userId: string, key: string, now = new Date()): boolean {
	if (db.insert(emailLog).values({ userId, key }).onConflictDoNothing().run().changes) return true;
	const row = db.select().from(emailLog).where(where(userId, key)).get();
	if (!row?.retryAt || row.retryAt > now.toISOString()) return false;
	// taken off the retry list as it's tried; a failure puts it back
	return db.update(emailLog).set({ retryAt: null }).where(and(eq(emailLog.id, row.id), lte(emailLog.retryAt, now.toISOString()))).run().changes === 1;
}

/** It went: an earlier failure's message is cleared. */
export function sendSucceeded(userId: string, key: string) {
	db.update(emailLog).set({ error: null, retryAt: null }).where(where(userId, key)).run();
}

/**
 * It didn't go: tried again after a wait, or given up after MAX_ATTEMPTS, with
 * one line in the log either way. `what` is "a task reminder", "a notification".
 */
export function sendFailed(userId: string, key: string, error: unknown, opts: { area: LogArea; what: string; now?: Date }) {
	const now = opts.now ?? new Date();
	const row = db.select().from(emailLog).where(where(userId, key)).get();
	const attempts = (row?.attempts ?? 0) + 1;
	const message = error instanceof Error ? error.message : String(error);
	const giveUp = attempts >= MAX_ATTEMPTS;
	db.update(emailLog)
		.set({ attempts, error: message.slice(0, 500), retryAt: giveUp ? null : new Date(now.getTime() + retryWait(attempts)).toISOString() })
		.where(where(userId, key))
		.run();
	const what = opts.what.charAt(0).toUpperCase() + opts.what.slice(1);
	if (giveUp) logger.error(opts.area, `${what} didn't send after ${attempts} tries, and won't be tried again`, { userId, key, error });
	else logger.error(opts.area, `${what} didn't send; trying again in ${Math.round(retryWait(attempts) / 60_000)} minutes`, { userId, key, attempt: attempts, error });
}

/** Whether `key` has gone, or is being tried again (#180): the grouped push leaves out what its tasks' own pushes covered. */
export function wasClaimed(userId: string, key: string): boolean {
	return !!db.select({ id: emailLog.id }).from(emailLog).where(where(userId, key)).get();
}

/** `key` went as part of something else (a tank's grouped push, #180): never sent on its own, or tried again, after. */
export function markSent(userId: string, key: string) {
	if (!db.insert(emailLog).values({ userId, key }).onConflictDoNothing().run().changes) sendSucceeded(userId, key);
}
