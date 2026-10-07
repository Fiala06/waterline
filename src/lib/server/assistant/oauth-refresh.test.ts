import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-oauth-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('../db');
const { assistantTokens, logs, oauthClients, users } = await import('../db/schema');
const { refreshTokens } = await import('./oauth');
const { hash } = await import('./tokens');

const user = db.insert(users).values({ email: 'keeper@example.com', displayName: 'Keeper' }).returning().get();
const client = db.insert(oauthClients).values({ id: 'client-r', name: 'Claude', redirectUris: ['https://claude.ai/cb'] }).returning().get();
const connect = (refresh: string) =>
	db
		.insert(assistantTokens)
		.values({ userId: user.id, name: 'Claude', tokenHash: hash(`wla_${refresh}`), hint: 'abcd', clientId: client.id, refreshHash: hash(refresh), refreshExpiresAt: '2099-01-01T00:00:00.000Z' })
		.returning()
		.get();
const form = (refresh: string) => new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh });
const grant = (refresh: string) => {
	try {
		return refreshTokens(client, form(refresh));
	} catch (e) {
		return (e as { code?: string }).code ?? String(e);
	}
};

describe('refresh token rotation (#100)', () => {
	it('spends a refresh token once: the second use is invalid_grant, and the new one works', () => {
		connect('wlr_first');
		const first = grant('wlr_first');
		expect(first).toHaveProperty('refresh_token');
		expect(grant('wlr_first')).toBe('invalid_grant');
		const next = (first as { refresh_token: string }).refresh_token;
		expect(grant(next)).toHaveProperty('access_token');
	});

	it('logs a replayed refresh token without the token, and leaves the connection working', () => {
		const row = connect('wlr_second');
		const fresh = (grant('wlr_second') as { refresh_token: string }).refresh_token;
		expect(grant('wlr_second')).toBe('invalid_grant');
		const entry = db.select().from(logs).where(eq(logs.userId, user.id)).all().find((l) => /already used/.test(l.message));
		expect(entry).toBeDefined();
		expect(JSON.stringify(entry)).not.toContain('wlr_second');
		expect(db.select().from(assistantTokens).where(eq(assistantTokens.id, row.id)).get()).toBeDefined();
		expect(grant(fresh)).toHaveProperty('access_token');
	});

	it('only rotates while the row still holds the token being spent (compare and swap)', () => {
		const row = connect('wlr_third');
		// another refresh got there first, between the lookup and the update
		db.update(assistantTokens).set({ refreshHash: hash('wlr_elsewhere') }).where(eq(assistantTokens.id, row.id)).run();
		expect(grant('wlr_third')).toBe('invalid_grant');
		expect(db.select().from(assistantTokens).where(eq(assistantTokens.id, row.id)).get()?.refreshHash).toBe(hash('wlr_elsewhere'));
	});
});
