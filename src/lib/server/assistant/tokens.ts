// Access tokens for an AI assistant the keeper connects (#9). A token reads the
// tanks it was made for and changes nothing. It's shown once; the database
// keeps its SHA-256 hash and last 4 characters.
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { assistantTokens, tanks, users, type AssistantToken, type User } from '../db/schema';

const PREFIX = 'wl_';
/** How often "last used" is written: at most once a minute per token. */
const TOUCH_MS = 60_000;
export const MAX_TOKENS = 20;

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export function listAssistantTokens(userId: string): AssistantToken[] {
	return db.select().from(assistantTokens).where(eq(assistantTokens.userId, userId)).orderBy(desc(assistantTokens.createdAt)).all();
}

/** The keeper's own tanks among these ids, in their order. */
function ownTanks(userId: string, tankIds: string[]) {
	const mine = new Set(db.select({ id: tanks.id }).from(tanks).where(eq(tanks.userId, userId)).all().map((t) => t.id));
	return [...new Set(tankIds)].filter((id) => mine.has(id));
}

/** A new token for these tanks: the token itself, to show once, and its row. */
export function createAssistantToken(userId: string, name: string, tankIds: string[]) {
	const token = PREFIX + randomBytes(32).toString('base64url');
	const row = db
		.insert(assistantTokens)
		.values({ userId, name: name.trim().slice(0, 60) || 'AI assistant', tokenHash: hash(token), hint: token.slice(-4), tankIds: ownTanks(userId, tankIds) })
		.returning()
		.get();
	return { token, row };
}

/** Which tanks a token can read: the keeper's own only. */
export function setTokenTanks(userId: string, id: string, tankIds: string[]) {
	return db
		.update(assistantTokens)
		.set({ tankIds: ownTanks(userId, tankIds) })
		.where(and(eq(assistantTokens.id, id), eq(assistantTokens.userId, userId)))
		.returning()
		.get();
}

export function revokeAssistantToken(userId: string, id: string) {
	return db
		.delete(assistantTokens)
		.where(and(eq(assistantTokens.id, id), eq(assistantTokens.userId, userId)))
		.returning()
		.get();
}

export interface AssistantAccess {
	user: User;
	token: AssistantToken;
	/** the tanks it may read, still the keeper's */
	tankIds: Set<string>;
}

/** "Bearer wl_…" to its keeper and tanks, or null. Marks it used. */
export function authenticateAssistant(authorization: string | null, now = Date.now()): AssistantAccess | null {
	const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
	if (!m || !m[1].startsWith(PREFIX)) return null;
	const row = db
		.select({ token: assistantTokens, user: users })
		.from(assistantTokens)
		.innerJoin(users, eq(users.id, assistantTokens.userId))
		.where(eq(assistantTokens.tokenHash, hash(m[1])))
		.get();
	if (!row) return null;
	if (!row.token.lastUsedAt || now - Date.parse(row.token.lastUsedAt) > TOUCH_MS) {
		const at = new Date(now).toISOString();
		db.update(assistantTokens).set({ lastUsedAt: at }).where(eq(assistantTokens.id, row.token.id)).run();
		row.token.lastUsedAt = at;
	}
	return { user: row.user, token: row.token, tankIds: new Set(ownTanks(row.user.id, row.token.tankIds)) };
}
