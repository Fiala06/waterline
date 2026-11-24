import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A send that keeps failing (#232): tried again later, waiting longer each time,
// given up after a few tries, and leaving no Mark done / Snooze links behind.
const dir = mkdtempSync(join(tmpdir(), 'wl-send-log-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, ORIGIN: 'https://tanks.example.com', EMAIL_TRANSPORT: 'outbox' } }));
const failing = vi.hoisted(() => ({ on: true, calls: 0 }));
vi.mock('./mail', async (original) => {
	const real = await original<typeof import('./mail')>();
	return {
		...real,
		sendMail: async (msg: Parameters<typeof real.sendMail>[0]) => {
			failing.calls++;
			if (failing.on) throw new Error('550 recipient refused');
			return real.sendMail(msg);
		}
	};
});
const { db } = await import('./db');
const { actionTokens, emailLog, logs } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createTask } = await import('./tasks');
const { alertOutOfRange, notifyUser, retryTestAlerts } = await import('./notifications');
const { claimSend, MAX_ATTEMPTS, pruneSendLog, retryWait, sendFailed } = await import('./send-log');
const { todayInZone } = await import('$lib/time');

describe('retryWait', () => {
	it('doubles from 15 minutes, up to 4 hours', () => {
		expect([1, 2, 3, 4, 5, 6, 9].map((n) => retryWait(n) / 60_000)).toEqual([15, 30, 60, 120, 240, 240, 240]);
	});
});

describe('claimSend and sendFailed', () => {
	const user = upsertUser({ email: 'claims@example.com', name: 'Claims' });
	const row = (key: string) => db.select().from(emailLog).where(eq(emailLog.key, key)).get()!;

	it('claims a key once, and a failed one again only when its retry is due', () => {
		const t0 = new Date('2026-11-10T10:00:00Z');
		expect(claimSend(user.id, 'k1', t0)).toBe(true);
		expect(claimSend(user.id, 'k1', t0)).toBe(false);
		sendFailed(user.id, 'k1', new Error('down'), { area: 'email', what: 'a test email', now: t0 });
		expect(row('k1')).toMatchObject({ attempts: 1, error: 'down', retryAt: '2026-11-10T10:15:00.000Z' });
		expect(claimSend(user.id, 'k1', new Date('2026-11-10T10:14:00Z'))).toBe(false);
		expect(claimSend(user.id, 'k1', new Date('2026-11-10T10:15:00Z'))).toBe(true);
		// claimed: a second run at the same moment doesn't send it too
		expect(claimSend(user.id, 'k1', new Date('2026-11-10T10:15:00Z'))).toBe(false);
	});

	it(`gives up after ${MAX_ATTEMPTS} tries, and says so once`, () => {
		let now = new Date('2026-11-10T10:00:00Z');
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			expect(claimSend(user.id, 'k2', now)).toBe(true);
			sendFailed(user.id, 'k2', new Error('down'), { area: 'email', what: 'a test email', now });
			now = new Date(now.getTime() + 5 * 3_600_000);
		}
		expect(row('k2')).toMatchObject({ attempts: MAX_ATTEMPTS, retryAt: null });
		expect(claimSend(user.id, 'k2', new Date('2027-01-01T00:00:00Z'))).toBe(false);
		const gaveUp = db.select().from(logs).all().filter((l) => l.message.includes("won't be tried again"));
		expect(gaveUp).toHaveLength(1);
	});
});

describe('a reminder email that fails', () => {
	const user = upsertUser({ email: 'refused@example.com', name: 'Refused' });
	const tank = createTank(user, { name: 'Refused 20', type: 'freshwater', nominalVolumeL: 75 });
	createTask(user.id, tank.id, { name: 'Clean glass', kind: 'maintenance', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: todayInZone(user.timeZone), openFormOnDone: false });
	const key = () => db.select().from(emailLog).where(eq(emailLog.userId, user.id)).get()!;
	const tokens = () => db.select().from(actionTokens).where(eq(actionTokens.userId, user.id)).all();
	beforeEach(() => {
		failing.calls = 0;
	});

	it('leaves no links behind, waits before trying again, and goes once it can', async () => {
		failing.on = true;
		await notifyUser(user, new Date(), true);
		expect(failing.calls).toBe(1);
		expect(key()).toMatchObject({ attempts: 1, error: '550 recipient refused' });
		expect(key().retryAt).not.toBeNull();
		expect(tokens()).toHaveLength(0);

		// the next run, five minutes on: not yet
		failing.calls = 0;
		await notifyUser(user, new Date(), true);
		expect(failing.calls).toBe(0);

		// its retry comes round, and this time it goes
		db.update(emailLog).set({ retryAt: new Date(Date.now() - 1000).toISOString() }).where(eq(emailLog.userId, user.id)).run();
		failing.on = false;
		await notifyUser(user, new Date(), true);
		expect(failing.calls).toBe(1);
		expect(key()).toMatchObject({ attempts: 1, error: null, retryAt: null });
		expect(tokens()).toHaveLength(2);
		// and it isn't sent again
		await notifyUser(user, new Date(), true);
		expect(failing.calls).toBe(1);
	});
});

describe('pruneSendLog (#347)', () => {
	const user = upsertUser({ email: 'prune@example.com', name: 'Prune' });
	const tank = createTank(user, { name: 'Prune tank', type: 'freshwater', nominalVolumeL: 60 });
	const stuck = createTask(user.id, tank.id, { name: 'Overdue for ages', kind: 'other', recurring: true, intervalDays: 7, scheduleMode: 'completion', nextDue: '2026-01-05', openFormOnDone: false });
	const keys = () => db.select({ key: emailLog.key }).from(emailLog).where(eq(emailLog.userId, user.id)).all().map((r) => r.key).sort();

	it('forgets sends after 90 days, but not an overdue alert for a task still due that day', () => {
		const old = '2026-01-06T09:00:00.000Z';
		for (const key of ['daily-digest:2026-01-06', `overdue:${stuck.id}:2026-01-05`, `push:overdue:${stuck.id}:2026-01-05`, `reminder:${stuck.id}:2025-12-29`, 'oor:some-test'])
			db.insert(emailLog).values({ userId: user.id, key, sentAt: old }).run();
		db.insert(emailLog).values({ userId: user.id, key: 'daily-digest:2026-04-01', sentAt: '2026-04-01T09:00:00.000Z' }).run();
		expect(pruneSendLog(Date.parse('2026-04-20T00:00:00.000Z'))).toBe(3);
		expect(keys()).toEqual(['daily-digest:2026-04-01', `overdue:${stuck.id}:2026-01-05`, `push:overdue:${stuck.id}:2026-01-05`].sort());
	});
});

describe("a test's out-of-range alert that fails (#334)", async () => {
	const { listParams, updateParams } = await import('./tanks');
	const { createTest } = await import('./logs');
	const user = upsertUser({ email: 'oor-retry@example.com', name: 'Retry' });
	const tank = createTank(user, { name: 'Retry 40', type: 'freshwater', nominalVolumeL: 150 });
	const no3 = listParams(tank.id).find((p) => p.key === 'no3')!;
	updateParams(user.id, tank.id, [{ id: no3.id, min: 5, max: 20, tracked: true }]);
	const row = () => db.select().from(emailLog).where(eq(emailLog.userId, user.id)).get()!;
	// alerts go only to people who may sign in: anyone, here
	const { serverSettings } = await import('./db/schema');
	const { getServerSettings } = await import('./mail');
	getServerSettings();
	db.update(serverSettings).set({ signupMode: 'open' }).where(eq(serverSettings.id, 1)).run();

	it('is tried again by the scheduler when its retry is due, and only then', async () => {
		const { test } = createTest(user.id, tank.id, { takenAt: new Date().toISOString(), note: null, readings: new Map([[no3.id, 500]]) }, { timeZone: 'UTC' });
		failing.on = true;
		failing.calls = 0;
		await alertOutOfRange(user, tank.id, test.id);
		expect(failing.calls).toBe(1);
		expect(row()).toMatchObject({ key: `oor:${test.id}`, attempts: 1 });
		// not due yet
		failing.on = false;
		await retryTestAlerts();
		expect(failing.calls).toBe(1);
		// due: it goes, once
		db.update(emailLog).set({ retryAt: new Date(Date.now() - 1000).toISOString() }).where(eq(emailLog.userId, user.id)).run();
		await retryTestAlerts();
		expect(failing.calls).toBe(2);
		expect(row()).toMatchObject({ error: null, retryAt: null });
		await retryTestAlerts();
		expect(failing.calls).toBe(2);
	});
});
