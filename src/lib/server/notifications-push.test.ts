import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// When task pushes go (#180): one per tank for the tasks due together, each
// task at its own time of day, nothing in quiet hours. Pushes go to a stand-in
// ntfy server; a database of its own.
const dir = mkdtempSync(join(tmpdir(), 'wl-push-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, ORIGIN: 'https://tanks.example.com', EMAIL_TRANSPORT: 'outbox', OPEN_SIGNUP: 'true' } }));
const { db } = await import('./db');
const { notificationPrefs, tanks } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { createTask } = await import('./tasks');
const { notifyUser, prefsFor } = await import('./notifications');
const { getTask } = await import('./tasks');
const linkPage = await import('../../routes/e/[token]/+page.server');

type Sent = { title: string; message: string; click: string; actions: { action: string; label: string; url: string }[] };
let sent: Sent[] = [];
beforeEach(() => {
	sent = [];
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		sent.push(JSON.parse(String(init.body)));
		return new Response('{}', { status: 200 });
	});
});
afterEach(() => vi.unstubAllGlobals());

let n = 0;
/** A keeper with an ntfy topic, email off, and the prefs given. */
function keeper(prefs: Partial<typeof notificationPrefs.$inferInsert> = {}) {
	n++;
	const user = upsertUser({ email: `k${n}@example.com`, name: `Keeper ${n}`, googleSub: `g-${n}` });
	prefsFor(user.id);
	db.update(notificationPrefs)
		.set({ ntfyUrl: 'https://ntfy.example.com/waterline', taskReminders: false, overdueAlerts: false, outOfRangeAlerts: false, sendTime: '08:00', ...prefs })
		.where(eq(notificationPrefs.userId, user.id))
		.run();
	const tank = createTank(user, { name: `Riverbed ${n}`, type: 'freshwater', nominalVolumeL: 150 });
	const task = (name: string, extra: Record<string, unknown> = {}) =>
		createTask(user.id, tank.id, { name, kind: 'maintenance', recurring: true, intervalDays: 7, scheduleMode: 'fixed', nextDue: '2026-11-11', openFormOnDone: false, ...extra });
	return { user: { ...user, timeZone: 'UTC' }, tank, task };
}
const at = (time: string, date = '2026-11-11') => new Date(`${date}T${time}:00Z`);

describe('task pushes for a tank (#180)', () => {
	it('sends the tasks due together as one push, with Open and Snooze all', async () => {
		const k = keeper();
		const a = k.task('Water change 25%');
		const b = k.task('Dose iron');
		k.task('Rinse sponge');
		k.task('Top off');
		await notifyUser(k.user, at('08:00'));
		expect(sent).toHaveLength(1);
		expect(sent[0].title).toBe(`${k.tank.name} · 4 tasks due`);
		expect(sent[0].message).toMatch(/^(Water change 25%|Dose iron|Rinse sponge|Top off)(, [^,]+){2}, …$/);
		expect(sent[0].click).toBe(`https://tanks.example.com/tasks?filter=${k.tank.id}`);
		expect(sent[0].actions.map((x) => [x.action, x.label])).toEqual([
			['view', 'Open'],
			['http', 'Snooze all 1 day']
		]);
		// each task's own snooze link, joined
		expect(sent[0].actions[1].url.split('/e/')[1].split('.')).toHaveLength(4);
		// once only: the next run of the scheduler sends nothing
		await notifyUser(k.user, at('08:05'));
		expect(sent).toHaveLength(1);
		expect(a.id && b.id).toBeTruthy();
	});

	it('sends a task that comes due later in the day on its own', async () => {
		const k = keeper();
		k.task('Water change 25%');
		k.task('Dose iron');
		await notifyUser(k.user, at('08:00'));
		k.task('Clean glass');
		await notifyUser(k.user, at('09:00'));
		expect(sent.map((s) => s.title)).toEqual([`${k.tank.name} · 2 tasks due`, 'Due today: Clean glass']);
	});

	it('sends each task on its own when grouping is off, as before', async () => {
		const k = keeper({ pushGrouped: false });
		k.task('Water change 25%');
		k.task('Dose iron');
		await notifyUser(k.user, at('08:00'));
		expect(sent.map((s) => s.title).toSorted()).toEqual(['Due today: Dose iron', 'Due today: Water change 25%']);
		expect(sent[0].actions.map((x) => x.label)).toEqual(['Mark done', 'Snooze']);
	});

	it('pushes a task with a time of day then, not at the send time', async () => {
		const k = keeper();
		k.task('Water change 25%');
		k.task('Feed the plecos', { remindAt: '21:00' });
		await notifyUser(k.user, at('08:00'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Water change 25%']);
		await notifyUser(k.user, at('20:55'));
		expect(sent).toHaveLength(1);
		await notifyUser(k.user, at('21:00'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Water change 25%', 'Due today: Feed the plecos']);
	});

	it('holds a push back in quiet hours, and sends it once when they end', async () => {
		const k = keeper({ sendTime: '06:00', quietStart: '22:00', quietEnd: '07:00' });
		k.task('Dose iron');
		await notifyUser(k.user, at('06:00'));
		await notifyUser(k.user, at('06:55'));
		expect(sent).toHaveLength(0);
		await notifyUser(k.user, at('07:00'));
		await notifyUser(k.user, at('07:05'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Dose iron']);
	});

	it('pushes 30 minutes before the lights come on, and at lights off', async () => {
		const k = keeper();
		db.update(tanks).set({ lightsOn: '10:00', lightsOff: '18:00' }).where(eq(tanks.id, k.tank.id)).run();
		k.task('Dose Easy Green', { remindAt: 'before_lights' });
		k.task('Feed the shrimp', { remindAt: 'lights_off' });
		await notifyUser(k.user, at('09:25'));
		expect(sent).toHaveLength(0);
		await notifyUser(k.user, at('09:30'));
		await notifyUser(k.user, at('17:55'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Dose Easy Green']);
		await notifyUser(k.user, at('18:00'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Dose Easy Green', 'Due today: Feed the shrimp']);
	});

	it('follows the lights, or the send time without a light schedule', async () => {
		const k = keeper();
		k.task('Dose before the lights', { remindAt: 'before_lights' });
		await notifyUser(k.user, at('07:55'));
		expect(sent).toHaveLength(0);
		await notifyUser(k.user, at('08:00'));
		expect(sent.map((s) => s.title)).toEqual(['Due today: Dose before the lights']);
	});

	it('snoozes every task in the push with Snooze all, once', async () => {
		const k = keeper();
		const a = k.task('Water change 25%');
		const b = k.task('Dose iron');
		await notifyUser(k.user, at('08:00'));
		const token = sent[0].actions[1].url.split('/e/')[1];
		const shown = (linkPage.load as (e: unknown) => { state: string; many?: string[] })({ params: { token } });
		expect(shown.state).toBe('ok');
		expect(shown.many?.toSorted()).toEqual(['Dose iron', 'Water change 25%']);
		const run = linkPage.actions.default as (e: unknown) => { message?: string } | { status: number };
		expect(run({ params: { token } })).toMatchObject({ message: 'Snoozed 2 tasks for a day' });
		expect(getTask(k.user.id, a.id).snoozedUntil).toBeTruthy();
		expect(getTask(k.user.id, b.id).snoozedUntil).toBeTruthy();
		// a second tap finds the links used
		expect(run({ params: { token } })).toMatchObject({ status: 410 });
	});
});
