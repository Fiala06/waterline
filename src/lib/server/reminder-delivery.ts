// The facts behind "how this reminder reaches you" (#310): the keeper's
// notification settings, the server's email, their push devices and ntfy,
// the tank's lights, and the last time this task's reminder was sent.
import { and, desc, eq, like, or } from 'drizzle-orm';
import { tankLighting } from '$lib/equipment';
import { lightTimes, quietOf, LATEST_PUSH } from '$lib/remind-time';
import { reminderDelivery, type ReminderDelivery } from '$lib/reminder-delivery';
import { effectiveDue } from '$lib/tasks';
import { fmtWhen, todayInZone } from '$lib/time';
import { db } from './db';
import { emailLog, type Task, type User } from './db/schema';
import { emailConfigured } from './mail';
import { notifiesUser } from './members';
import { prefsFor, recipient } from './notifications';
import { listSubscriptions } from './push/webpush';
import { scheduledItems } from './specs';
import { getTank, roleOn } from './tanks';
import { getTask, reminderHold, settleTasks } from './tasks';

export function taskDelivery(user: User, task: Task): ReminderDelivery {
	const today = todayInZone(user.timeZone);
	// a pause that's up: settled first, as the scheduler does, so the forecast is from the dates moved on (#323)
	if (task.pausedUntil && task.pausedUntil <= today) {
		settleTasks(user.id, user.timeZone);
		task = getTask(user.id, task.id);
	}
	const prefs = prefsFor(user.id);
	const tank = getTank(user.id, task.tankId);
	// this task's reminders, by email or push, newest first: "reminder:<task>:<due>", "push:reminder:<task>:<due>"
	const last = db
		.select()
		.from(emailLog)
		.where(and(eq(emailLog.userId, user.id), or(like(emailLog.key, `reminder:${task.id}:%`), like(emailLog.key, `push:reminder:${task.id}:%`))))
		.orderBy(desc(emailLog.sentAt))
		.get();
	return reminderDelivery(
		{
			due: effectiveDue(task),
			kind: task.kind,
			remindAt: task.remindAt,
			today,
			leadDays: prefs.leadDays,
			sendTime: prefs.sendTime > LATEST_PUSH ? LATEST_PUSH : prefs.sendTime,
			lights: lightTimes(tankLighting(tank, scheduledItems(tank.id)).lights?.schedule),
			quiet: quietOf(prefs.quietStart, prefs.quietEnd),
			notified: notifiesUser(tank, user.id, 'remind', roleOn(user.id, tank)),
			email: {
				configured: emailConfigured(),
				to: recipient(user, { ...prefs, unsubscribedAt: null }),
				unsubscribed: !!prefs.unsubscribedAt,
				on: prefs.taskReminders,
				delivery: prefs.delivery
			},
			push: { on: prefs.pushTaskReminders, devices: listSubscriptions(user.id).length, ntfy: !!prefs.ntfyUrl },
			lastSent: last ? { at: last.sentAt, by: last.key.startsWith('push:') ? 'push' : 'email', error: !!last.error } : null,
			hold: reminderHold(task, tank, today)
		},
		(iso) => fmtWhen(iso, user.timeZone)
	);
}

/** For the page: the summary, and this keeper's push endpoints so it can tell whether this device is one. */
export function deliveryView(user: User, task: Task) {
	return { delivery: taskDelivery(user, task), devices: listSubscriptions(user.id).map((s) => s.endpoint) };
}
