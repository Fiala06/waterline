import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// The reminder forecast follows the scheduler's rules (#323): a paused task,
// a done one-off and an archived tank's task promise no email or push, and a
// pause that's up is forecast from the dates it moved on to.
const dir = mkdtempSync(join(tmpdir(), 'wl-reminder-hold-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, ORIGIN: 'https://tanks.example.com', EMAIL_TRANSPORT: 'outbox' } }));
const { db } = await import('./db');
const { notificationPrefs, pushSubscriptions, tasks } = await import('./db/schema');
const { upsertUser, getUser } = await import('./users');
const { createTank, setArchived } = await import('./tanks');
const { createTask, getTask, listTasks, pauseTasks, reminderHold } = await import('./tasks');
const { prefsFor } = await import('./notifications');
const { taskDelivery } = await import('./reminder-delivery');
const { addDays, todayInZone } = await import('$lib/time');

const today = todayInZone('UTC');
let n = 0;
function keeper() {
	n++;
	const u = upsertUser({ email: `hold${n}@example.com`, name: `Hold ${n}`, googleSub: `g-hold-${n}` });
	prefsFor(u.id);
	db.update(notificationPrefs).set({ ntfyUrl: 'https://ntfy.example.com/t', leadDays: 1, sendTime: '08:00' }).where(eq(notificationPrefs.userId, u.id)).run();
	db.insert(pushSubscriptions).values({ userId: u.id, endpoint: `https://push.example.com/${n}`, p256dh: 'k', auth: 'a', label: 'Chrome' }).run();
	const user = getUser(u.id)!;
	const tank = createTank(user, { name: `Tank ${n}`, type: 'freshwater', nominalVolumeL: 60 });
	const task = createTask(user.id, tank.id, { name: 'Clean filter', kind: 'maintenance', recurring: true, intervalDays: 14, scheduleMode: 'fixed', nextDue: addDays(today, 1), openFormOnDone: false });
	return { user, tank, task };
}
const listed = (userId: string, taskId: string) => listTasks(userId).some((r) => r.task.id === taskId);

describe('the reminder forecast and the scheduler agree (#323)', () => {
	it('a task due inside a pause: no send date, no email or push, until it resumes', () => {
		const { user, tank, task } = keeper();
		// email and push are set up, and it would go today
		const before = taskDelivery(user, getTask(user.id, task.id));
		expect(before.held).toBeNull();
		expect(before.channels.map((c) => c.label)).toEqual(['✓ Email', '✓ Push']);
		expect(before.day).not.toBeNull();

		pauseTasks(user.id, [task.id], addDays(today, 5), 'UTC');
		const paused = getTask(user.id, task.id);
		expect(listed(user.id, task.id)).toBe(false);
		expect(reminderHold(paused, tank, today)).toMatchObject({ kind: 'paused', until: addDays(today, 5) });
		const d = taskDelivery(user, paused);
		expect(d.day).toBeNull();
		expect(d.channels).toEqual([]);
		expect(d.held).toMatch(/^– Reminders paused until .+\. No email or push goes until then\.$/);

		// the pause is up (as on its last day): forecast from the dates it moved on to, as the scheduler sends
		db.update(tasks).set({ pausedFrom: addDays(today, -5), pausedUntil: today }).where(eq(tasks.id, task.id)).run();
		const after = taskDelivery(user, getTask(user.id, task.id));
		const settled = getTask(user.id, task.id);
		expect(settled.pausedUntil).toBeNull();
		expect(listed(user.id, task.id)).toBe(true);
		expect(after.held).toBeNull();
		expect(after.channels.map((c) => c.label)).toEqual(['✓ Email', '✓ Push']);
		expect(after.day).not.toBeNull();
	});

	it('a done one-off and an archived tank: none promised, and neither is in the scheduler’s list', () => {
		const a = keeper();
		db.update(tasks).set({ recurring: false, nextDue: null }).where(eq(tasks.id, a.task.id)).run();
		expect(listed(a.user.id, a.task.id)).toBe(false);
		expect(taskDelivery(a.user, getTask(a.user.id, a.task.id))).toMatchObject({ day: null, channels: [], held: '– No reminder scheduled: this task has no next date.' });

		const b = keeper();
		setArchived(b.user.id, b.tank.id, true);
		expect(listed(b.user.id, b.task.id)).toBe(false);
		const d = taskDelivery(b.user, getTask(b.user.id, b.task.id));
		expect(d.channels).toEqual([]);
		expect(d.held).toMatch(/this tank is archived/);
	});
});
