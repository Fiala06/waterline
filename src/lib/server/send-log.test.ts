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
const { notifyUser } = await import('./notifications');
const { claimSend, MAX_ATTEMPTS, retryWait, sendFailed } = await import('./send-log');
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
