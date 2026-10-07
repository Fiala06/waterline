import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-users-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const schema = await import('./db/schema');
const {
	assistantTokens,
	calendarFeeds,
	emailLog,
	events,
	exports,
	imports,
	invites,
	logs,
	notificationPrefs,
	oauthClients,
	oauthCodes,
	products,
	pushSubscriptions,
	serverSettings,
	tankMembers,
	tanks,
	testKits,
	tests,
	users
} = schema;
const { getTableConfig, SQLiteTable } = await import('drizzle-orm/sqlite-core');
const { is } = await import('drizzle-orm');
const { getServerSettings } = await import('./mail');
const { isEmailAllowed, upsertUser, USER_LINKS } = await import('./users');

const setAdmin = (adminEmail: string | null) => {
	getServerSettings();
	db.update(serverSettings).set({ adminEmail }).where(eq(serverSettings.id, 1)).run();
};

describe('the admin setting up Google sign-in', () => {
	it("keeps the local admin's account, tanks and all, for the admin's Google account", () => {
		setAdmin(null);
		// the local admin login, before there's an admin's Google account
		const local = upsertUser({ email: 'admin@localhost', name: 'Admin' });
		expect(local.isAdmin).toBe(true);

		// Server settings › Who can sign in: the admin's Google account
		setAdmin('keeper@gmail.com');
		expect(isEmailAllowed('keeper@gmail.com')).toBe(true);
		const google = upsertUser({ email: 'Keeper@gmail.com', name: 'Keeper', googleSub: 'g-1' });
		expect(google.id).toBe(local.id);
		expect(google).toMatchObject({ email: 'keeper@gmail.com', googleSub: 'g-1', isAdmin: true });

		// and the local admin login opens the same account
		expect(upsertUser({ email: 'keeper@gmail.com', name: 'Admin' }).id).toBe(local.id);
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it("never gives it to anyone else: someone else's Google account is a new account", () => {
		setAdmin(null);
		const local = upsertUser({ email: 'admin@localhost', name: 'Admin' });
		setAdmin('owner@gmail.com');
		const other = upsertUser({ email: 'friend@gmail.com', name: 'Friend', googleSub: 'g-2' });
		expect(other.id).not.toBe(local.id);
		expect(other.isAdmin).toBe(false);
	});

	it('joins the new account a Google sign-in made before 1.8.3 to the local admin\'s, tanks and all', () => {
		setAdmin(null);
		const local = upsertUser({ email: 'admin@localhost', name: 'Admin' });
		db.insert(tanks).values({ userId: local.id, name: 'Betta Tank', type: 'planted' }).run();

		// 1.8.2: the admin's Google account signed in and got an account of its own
		setAdmin('cory@gmail.com');
		const fresh = db.insert(users).values({ email: 'cory@gmail.com', displayName: 'Cory', googleSub: 'g-3', isAdmin: true }).returning().get();
		db.insert(tanks).values({ userId: fresh.id, name: 'Shrimp Bowl', type: 'freshwater' }).run();
		db.insert(products).values({ userId: fresh.id, name: 'Easy Green', url: 'https://example.com/easy-green' }).run();

		// the next sign-in, with Google or the local admin login: one account
		const joined = upsertUser({ email: 'cory@gmail.com', name: 'Cory', googleSub: 'g-3' });
		expect(joined).toMatchObject({ id: local.id, email: 'cory@gmail.com', googleSub: 'g-3', isAdmin: true, displayName: 'Cory' });
		expect(db.select({ name: tanks.name }).from(tanks).where(eq(tanks.userId, local.id)).all().map((t) => t.name).sort()).toEqual(['Betta Tank', 'Shrimp Bowl']);
		expect(db.select().from(products).where(eq(products.userId, local.id)).all()).toHaveLength(1);
		expect(db.select().from(users).where(eq(users.id, fresh.id)).get()).toBeUndefined();
		expect(upsertUser({ email: 'cory@gmail.com', name: 'Admin' }).id).toBe(local.id);
	});

	it('keeps everything the joining account has, in every table that points at it (#112)', () => {
		setAdmin(null);
		const local = upsertUser({ email: 'admin@localhost', name: 'Admin' });
		const mine = db.insert(tanks).values({ userId: local.id, name: 'Local tank', type: 'planted' }).returning().get();
		db.insert(emailLog).values({ userId: local.id, key: 'daily-digest:2026-10-01' }).run();
		db.insert(calendarFeeds).values({ token: 'cal-local', userId: local.id }).run();

		// a keeper who shares two tanks: one with both accounts, one with the Google account only
		const friend = db.insert(users).values({ email: 'friend@example.com', displayName: 'Friend' }).returning().get();
		const both = db.insert(tanks).values({ userId: friend.id, name: 'Both', type: 'reef' }).returning().get();
		const onlyGoogle = db.insert(tanks).values({ userId: friend.id, name: 'Only Google', type: 'freshwater' }).returning().get();
		const member = (tankId: string, userId: string, email: string, role: 'log' | 'view', token: string) =>
			db.insert(tankMembers).values({ tankId, userId, email, role, tokenHash: token, expiresAt: '2030-01-01', acceptedAt: '2026-09-01' }).returning().get();
		member(both.id, local.id, 'admin@localhost', 'view', 'tok-1');

		// 1.8.2: the Google account made its own account, with something in every table
		setAdmin('joined@gmail.com');
		const fresh = db.insert(users).values({ email: 'joined@gmail.com', displayName: 'Joined', googleSub: 'g-9', isAdmin: true }).returning().get();
		const theirs = db.insert(tanks).values({ userId: fresh.id, name: 'Google tank', type: 'freshwater' }).returning().get();
		db.insert(products).values({ userId: fresh.id, name: 'Easy Green', url: 'https://example.com/p' }).run();
		db.insert(testKits).values({ userId: fresh.id, name: 'API Nitrate', paramKey: 'no3' }).run();
		db.insert(imports).values({ userId: fresh.id, tankId: theirs.id, kind: 'tests', summary: '3 water tests' }).run();
		db.insert(exports).values({ userId: fresh.id, scope: 'account', format: 'zip' }).run();
		db.insert(assistantTokens).values({ userId: fresh.id, name: 'Claude', tokenHash: 'h-1', hint: 'abcd' }).run();
		db.insert(pushSubscriptions).values({ userId: fresh.id, endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a', label: 'Phone' }).run();
		db.insert(calendarFeeds).values({ token: 'cal-fresh', userId: fresh.id }).run();
		db.insert(emailLog).values([
			{ userId: fresh.id, key: 'daily-digest:2026-10-01' },
			{ userId: fresh.id, key: 'reminder:t1:2026-10-02' }
		]).run();
		db.insert(oauthClients).values({ id: 'client-1', name: 'Claude', redirectUris: ['https://claude.ai/cb'] }).run();
		db.insert(oauthCodes).values({ codeHash: 'c-1', clientId: 'client-1', userId: fresh.id, redirectUri: 'https://claude.ai/cb', codeChallenge: 'x', tankIds: [], expiresAt: '2030-01-01' }).run();
		const higher = member(both.id, fresh.id, 'joined@gmail.com', 'log', 'tok-2');
		const solo = member(onlyGoogle.id, fresh.id, 'joined@gmail.com', 'log', 'tok-3');
		// a share of the local admin's own tank, which the joined account will own
		const ownShare = member(mine.id, fresh.id, 'joined@gmail.com', 'log', 'tok-4');
		db.insert(invites).values({ email: 'guest@example.com', tokenHash: 'inv-1', expiresAt: '2030-01-01', invitedBy: fresh.id }).run();
		const entry = db.insert(events).values({ tankId: both.id, category: 'note', occurredAt: '2026-09-02T10:00:00Z', loggedBy: fresh.id }).returning().get();
		const test = db.insert(tests).values({ tankId: both.id, takenAt: '2026-09-02T10:00:00Z', loggedBy: fresh.id }).returning().get();
		db.insert(logs).values({ level: 'info', area: 'sign-in', message: 'signed in', userId: fresh.id }).run();

		const joined = upsertUser({ email: 'joined@gmail.com', name: 'Joined', googleSub: 'g-9' });
		expect(joined.id).toBe(local.id);
		expect(db.select().from(users).where(eq(users.id, fresh.id)).get()).toBeUndefined();
		const own = (t: typeof products | typeof testKits | typeof imports | typeof exports | typeof assistantTokens | typeof pushSubscriptions) =>
			db.select().from(t).where(eq(t.userId, local.id)).all().length;

		// moved
		expect(db.select().from(tanks).where(eq(tanks.userId, local.id)).all().map((t) => t.name).sort()).toEqual(['Google tank', 'Local tank']);
		expect([own(products), own(testKits), own(imports), own(exports), own(assistantTokens), own(pushSubscriptions)]).toEqual([1, 1, 1, 1, 1, 1]);
		expect(db.select().from(events).where(eq(events.id, entry.id)).get()?.loggedBy).toBe(local.id);
		expect(db.select().from(tests).where(eq(tests.id, test.id)).get()?.loggedBy).toBe(local.id);
		expect(db.select().from(logs).where(eq(logs.userId, local.id)).all()).toHaveLength(1);
		expect(db.select().from(invites).where(eq(invites.tokenHash, 'inv-1')).get()?.invitedBy).toBe(local.id);

		// merged: one active membership per shared tank, with the higher role; none on a tank they own
		const activeOn = (tankId: string) =>
			db
				.select()
				.from(tankMembers)
				.where(eq(tankMembers.tankId, tankId))
				.all()
				.filter((m) => m.userId === local.id && m.acceptedAt && !m.revokedAt);
		expect(activeOn(both.id).map((m) => m.role)).toEqual(['log']);
		expect(activeOn(onlyGoogle.id).map((m) => m.id)).toEqual([solo.id]);
		expect(activeOn(mine.id)).toEqual([]);
		expect(db.select().from(tankMembers).where(eq(tankMembers.id, higher.id)).get()?.revokedAt).not.toBeNull();
		expect(db.select().from(tankMembers).where(eq(tankMembers.id, ownShare.id)).get()?.revokedAt).not.toBeNull();
		// the kept account's calendar feed and settings; what was emailed, without the same key twice
		expect(db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, local.id)).get()?.token).toBe('cal-local');
		expect(db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, local.id)).all()).toHaveLength(1);
		expect(db.select({ key: emailLog.key }).from(emailLog).where(eq(emailLog.userId, local.id)).all().map((r) => r.key).sort()).toEqual([
			'daily-digest:2026-10-01',
			'reminder:t1:2026-10-02'
		]);
		// dropped on purpose: a sign-in code minutes from expiring
		expect(db.select().from(oauthCodes).all()).toEqual([]);
	});
});

describe('every column that points at an account has a merge policy (#112)', () => {
	it('lists each one in USER_LINKS, and nothing that no longer exists', () => {
		const found = new Set<string>();
		for (const t of Object.values(schema)) {
			if (!is(t, SQLiteTable)) continue;
			const cfg = getTableConfig(t);
			for (const fk of cfg.foreignKeys) {
				const ref = fk.reference();
				if (getTableConfig(ref.foreignTable).name !== 'users') continue;
				for (const c of ref.columns) found.add(`${cfg.name}.${c.name}`);
			}
			// account ids kept without a foreign key, so they outlive a deleted account
			for (const c of cfg.columns) if (c.name === 'logged_by' || (c.name === 'user_id' && cfg.name !== 'users')) found.add(`${cfg.name}.${c.name}`);
		}
		expect([...found].sort()).toEqual(Object.keys(USER_LINKS).sort());
	});
});
