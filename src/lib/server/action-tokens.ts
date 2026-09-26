// Single-use links in reminder emails. The raw token only lives in the email;
// the database keeps a SHA-256 hash.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from './db';
import { actionTokens, tanks, tasks, users } from './db/schema';

const TTL_DAYS = 14;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export function createActionToken(taskId: string, action: 'done' | 'snooze', due: string): string {
	const token = randomBytes(24).toString('base64url');
	db.insert(actionTokens)
		.values({
			tokenHash: hash(token),
			taskId,
			action,
			due,
			expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString()
		})
		.run();
	return token;
}

export type TokenState = 'ok' | 'used' | 'expired' | 'stale' | 'missing';

/** Look up a token with its task and owner. `stale` = the task has moved on since the email. */
export function readActionToken(token: string) {
	const row = db
		.select({ t: actionTokens, task: tasks, tank: tanks, user: users })
		.from(actionTokens)
		.innerJoin(tasks, eq(tasks.id, actionTokens.taskId))
		.innerJoin(tanks, eq(tanks.id, tasks.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(eq(actionTokens.tokenHash, hash(token)))
		.get();
	if (!row) return { state: 'missing' as TokenState, row: null };
	let state: TokenState = 'ok';
	if (row.t.usedAt) state = 'used';
	else if (row.t.expiresAt < new Date().toISOString()) state = 'expired';
	else if (row.task.nextDue !== row.t.due) state = 'stale';
	return { state, row };
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
