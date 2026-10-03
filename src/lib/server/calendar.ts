// Tasks as a calendar feed (#23): a private link a calendar app subscribes
// to. Each open task is an all-day event on its next due date; an overdue
// one shows today, so it isn't left behind in the past.
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildCalendar, type CalendarEvent } from '$lib/ics';
import { intervalText } from '$lib/tasks';
import { daysBetween, fmtDate, todayInZone } from '$lib/time';
import { db } from './db';
import { calendarFeeds, users, type User } from './db/schema';
import { listTasks } from './tasks';
import { notifiesUser } from './members';
import { listTanks, roleOn } from './tanks';

/** How often "last checked" is written. */
const TOUCH_MS = 60 * 60_000;

export const getFeed = (userId: string) => db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)).get();

/** A new link; the old one stops working. */
export function makeFeed(userId: string) {
	const token = randomBytes(24).toString('base64url');
	db.transaction((tx) => {
		tx.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId)).run();
		tx.insert(calendarFeeds).values({ token, userId }).run();
	});
	return token;
}

export function removeFeed(userId: string) {
	db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId)).run();
}

/** The link's owner, or null. Marks it fetched. */
export function readFeed(token: string, now = Date.now()): User | null {
	if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
	const row = db.select({ feed: calendarFeeds, user: users }).from(calendarFeeds).innerJoin(users, eq(users.id, calendarFeeds.userId)).where(eq(calendarFeeds.token, token)).get();
	if (!row) return null;
	if (!row.feed.lastFetchedAt || now - Date.parse(row.feed.lastFetchedAt) > TOUCH_MS) {
		db.update(calendarFeeds).set({ lastFetchedAt: new Date(now).toISOString() }).where(eq(calendarFeeds.token, token)).run();
	}
	return row.user;
}

/** The calendar: all the keeper's tanks, or one. */
export function feedCalendar(user: User, origin: string, opts: { tankId?: string; tankName?: string; now?: Date } = {}) {
	const now = opts.now ?? new Date();
	const today = todayInZone(user.timeZone, now);
	const host = new URL(origin).host;
	// a shared tank's tasks (#22) only when its reminders go to everyone who can log
	const tankRows = new Map(listTanks(user.id).map((t) => [t.id, t]));
	const events: CalendarEvent[] = listTasks(user.id, opts.tankId)
		.filter(({ task }) => {
			const t = tankRows.get(task.tankId);
			return !!t && notifiesUser(t, user.id, 'remind', roleOn(user.id, t));
		})
		.map(({ task, tankName }) => {
		const late = daysBetween(task.due, today);
		return {
			uid: `task-${task.id}@${host}`,
			date: late > 0 ? today : task.due,
			summary: `${late > 0 ? 'Overdue: ' : ''}${task.name} · ${tankName}`,
			description: [
				late > 0 ? `Overdue since ${fmtDate(task.due)}.` : null,
				`${intervalText(task).replace(/^./, (c) => c.toUpperCase())}.`,
				`Mark it done in Waterline: ${origin}/tasks`
			]
				.filter(Boolean)
				.join('\n'),
			url: `${origin}/tasks`
		};
	});
	return buildCalendar({
		name: opts.tankName ? `Waterline · ${opts.tankName}` : 'Waterline tasks',
		description: 'Your aquarium tasks from Waterline, on the day each is due.',
		events,
		now
	});
}
