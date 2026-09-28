import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// a database of its own, with every migration
const dir = mkdtempSync(join(tmpdir(), 'wl-users-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { products, serverSettings, tanks, users } = await import('./db/schema');
const { getServerSettings } = await import('./mail');
const { isEmailAllowed, upsertUser } = await import('./users');

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
});
