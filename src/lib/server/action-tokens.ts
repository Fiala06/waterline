// Single-use links in reminder emails. The raw token only lives in the email;
// the database keeps a SHA-256 hash.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from './db';
import { actionTokens, tanks, tasks } from './db/schema';
import { roleAllows, tankRole } from './members';
import { getUser, maySignIn } from './users';

const TTL_DAYS = 14;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

// the links made while a message is put together, so they can be taken back if it doesn't go (#232)
let made: string[] | null = null;

/** Run `render`, noting the links it makes: `drop()` deletes them, for a message that wasn't sent. */
export function collectTokens<T>(render: () => T): { value: T; drop: () => void } {
	const outer = made;
	const mine: string[] = [];
	made = mine;
	const drop = () => {
		if (mine.length) db.delete(actionTokens).where(inArray(actionTokens.tokenHash, mine)).run();
	};
	try {
		return { value: render(), drop };
	} catch (e) {
		drop();
		throw e;
	} finally {
		made = outer;
		outer?.push(...mine);
	}
}

/** A link for the person the reminder goes to: it does what they could do themselves (#216). */
export function createActionToken(taskId: string, action: 'done' | 'snooze', due: string, userId: string): string {
	const token = randomBytes(24).toString('base64url');
	made?.push(hash(token));
	db.insert(actionTokens)
		.values({
			tokenHash: hash(token),
			taskId,
			action,
			due,
			userId,
			expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString()
		})
		.run();
	return token;
}

export type TokenState = 'ok' | 'used' | 'expired' | 'stale' | 'missing';

/**
 * Look up a token with its task, and the person it acts as: whoever the
 * reminder was sent to (#216), or the tank's owner for a link from before
 * that was recorded. `stale` = the task has moved on since the email;
 * `expired` also when that person may no longer log on the tank (removed, or
 * made view-only) or sign in at all.
 */
export function readActionToken(token: string) {
	const found = db
		.select({ t: actionTokens, task: tasks, tank: tanks })
		.from(actionTokens)
		.innerJoin(tasks, eq(tasks.id, actionTokens.taskId))
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.where(eq(actionTokens.tokenHash, hash(token)))
		.get();
	const user = found ? getUser(found.t.userId ?? found.tank.userId) : undefined;
	if (!found || !user) return { state: 'missing' as TokenState, row: null };
	const row = { ...found, user };
	let state: TokenState = 'ok';
	if (row.t.usedAt) state = 'used';
	else if (row.t.expiresAt < new Date().toISOString()) state = 'expired';
	else if (!maySignIn(user) || !roleAllows(tankRole(user.id, row.tank), 'log')) state = 'expired';
	else if (row.task.nextDue !== row.t.due) state = 'stale';
	return { state, row };
}

/** Someone's links for a tank's tasks stop working: they were removed from it, or may only view it now (#216). */
export function revokeActionTokens(userId: string, tankId: string) {
	const ids = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tankId, tankId)).all().map((t) => t.id);
	if (ids.length) db.delete(actionTokens).where(and(eq(actionTokens.userId, userId), inArray(actionTokens.taskId, ids))).run();
}

/** Mark a token used; returns false if it was already used (double click, second tab). */
export function consumeActionToken(token: string): boolean {
	const res = db
		.update(actionTokens)
		.set({ usedAt: new Date().toISOString() })
		.where(and(eq(actionTokens.tokenHash, hash(token)), isNull(actionTokens.usedAt)))
		.run();
	return res.changes === 1;
}

export function pruneActionTokens() {
	db.delete(actionTokens).where(lt(actionTokens.expiresAt, new Date().toISOString())).run();
}
