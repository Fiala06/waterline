// Decides what to email and push, and when. Runs every few minutes (see
// scheduler.ts); each user's notices go out at their send time in their time
// zone, and the email log makes every send happen at most once. Email and push
// have their own switches per kind; push is one notice at a time, whatever the
// email delivery (digests are email only), and doesn't need email set up.
import { and, desc, eq, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { dueInfo, intervalText, isRoutine } from '$lib/tasks';
import { dateInZone, daysBetween, fmtDate, fmtTime, todayInZone, utcToZoned } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { createActionToken } from './action-tokens';
import { db } from './db';
import { logger } from './log';
import { emailLog, notificationPrefs, taskCompletions, tests, testReadings, users, type User } from './db/schema';
import { lastEventOf, latestReadings } from './logs';
import { emailConfigured, sendMail } from './mail';
import { digestEmail, outOfRangeEmail, taskEmail, type DigestTank, type Footer, type Rendered } from './mail/templates';
import { hasPushTarget, pushOnce, type Notice } from './push';
import { tankNotes } from './trends';
import { sign } from './secrets';
import { listParams, listTanks } from './tanks';
import { listTasks } from './tasks';
import { tankTypeLabel } from '$lib/types';

export type Prefs = typeof notificationPrefs.$inferSelect;

export function baseUrl(): string | null {
	const o = env.ORIGIN?.trim().replace(/\/+$/, '');
	return o || null;
}

export const unsubscribeToken = (userId: string) => sign(userId, 'unsubscribe');

export function prefsFor(userId: string): Prefs {
	return (
		db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).get() ??
		db.insert(notificationPrefs).values({ userId }).returning().get()
	);
}

export function recipient(user: User, prefs: Prefs): string | null {
	if (prefs.unsubscribedAt) return null;
	const to = (prefs.notifyEmail || user.email).trim();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return null; // e.g. admin@localhost
	return to;
}

function footer(user: User, reason: string, base: string, settingsLabel?: string): Footer {
	return {
		reason,
		settingsUrl: `${base}/settings#notifications`,
		unsubscribeUrl: `${base}/unsubscribe/${unsubscribeToken(user.id)}`,
		host: new URL(base).host,
		settingsLabel
	};
}

/** Send once per (user, key). A failed send is forgotten so the next run retries it. */
async function sendOnce(user: User, to: string, key: string, render: () => Rendered, base: string) {
	const inserted = db.insert(emailLog).values({ userId: user.id, key }).onConflictDoNothing().run();
	if (inserted.changes === 0) return false;
	try {
		const r = render();
		const unsub = `${base}/unsubscribe/${unsubscribeToken(user.id)}`;
		await sendMail({
			to,
			subject: r.subject,
			html: r.html,
			text: r.text,
			headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
		});
		logger.info('email', `Sent ${emailKind(key)}`, { userId: user.id });
		return true;
	} catch (e) {
		db.delete(emailLog).where(and(eq(emailLog.userId, user.id), eq(emailLog.key, key))).run();
		logger.error('email', `${cap(emailKind(key))} didn't send`, { userId: user.id, error: e });
		return false;
	}
}

/** "a task reminder", from an email's key */
function emailKind(key: string) {
	const kind = key.split(':')[0];
	return (
		{ reminder: 'a task reminder', overdue: 'an overdue alert', 'daily-digest': 'the daily digest', 'weekly-digest': 'the weekly digest', oor: 'an out-of-range alert' }[
			kind
		] ?? `an email (${kind})`
	);
}

const longDate = (d: string) =>
	new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function whenText(days: number) {
	if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
	if (days === 0) return 'Due today';
	if (days === 1) return 'Due tomorrow';
	return `Due in ${days} days`;
}

function lastDone(taskId: string, today: string, tz: string) {
	const c = db
		.select()
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, taskId))
		.orderBy(desc(taskCompletions.completedAt))
		.get();
	if (!c) return null;
	const d = dateInZone(c.completedAt, tz);
	const ago = daysBetween(d, today);
	return `${fmtDate(d)} · ${ago === 0 ? 'today' : `${ago} day${ago === 1 ? '' : 's'} ago`}`;
}

function tankSub(t: { type: string; nominalVolumeL: number | null }, user: User) {
	return `${tankTypeLabel(t.type)}${t.nominalVolumeL != null ? ` · ${formatNumber(toDisplay(t.nominalVolumeL, 'volume', user), 1)} ${unitLabel('volume', user)}` : ''}`;
}

/** Out-of-range readings in each tank's latest results. */
function badReadings(tankId: string, user: User) {
	const latest = latestReadings(tankId);
	return listParams(tankId)
		.map((p) => ({ p, r: latest.get(p.id) }))
		.filter(({ p, r }) => r && statusOf(p, r.value).level === 'bad')
		.map(({ p, r }) => ({
			text: `✕ ${shortName(p)} ${fmtValue(p, r!.value, user)}${paramUnit(p, user) ? ' ' + paramUnit(p, user) : ''}`,
			target: fmtRange(p, user, false),
			date: fmtDate(dateInZone(r!.takenAt, user.timeZone))
		}));
}

/** The setup review (#30) is done on its page, so its Mark done is a link there. */
const reviewUrl = (t: { tankId: string }, base: string) => `${base}/tanks/${t.tankId}/review`;

/** A task's push notification, with Mark done and Snooze (one-time links, made only when it's sent). */
function taskNotice(t: { id: string; name: string; kind: string; tankId: string; tankName: string; nextDue: string | null }, days: number, lastDoneText: string | null, base: string): Notice {
	const overdue = days < 0;
	const review = t.kind === 'review';
	const snooze = { action: 'snooze' as const, title: 'Snooze', url: `${base}/e/${createActionToken(t.id, 'snooze', t.nextDue!)}`, result: `Snoozed ${t.name} for a day` };
	return {
		kind: overdue ? 'overdue' : 'reminder',
		title: `${whenText(days)}: ${t.name}`,
		body: [t.tankName, lastDoneText && `Last done ${lastDoneText}`].filter(Boolean).join(' · '),
		// a review opens its page; there's nothing to mark done from the notification
		url: review ? reviewUrl(t, base) : `${base}/?tank=${t.tankId}`,
		tag: `task-${t.id}`,
		actions: review
			? [snooze]
			: [{ action: 'done', title: 'Mark done', url: `${base}/e/${createActionToken(t.id, 'done', t.nextDue!)}`, result: `✓ ${t.name} done` }, snooze]
	};
}

/** One user's scheduled emails and pushes. `force` ignores the send time (for tests and "send now"). */
export async function notifyUser(user: User, now = new Date(), force = false) {
	const base = baseUrl();
	if (!base) return { sent: 0 };
	const prefs = prefsFor(user.id);
	const to = emailConfigured() ? recipient(user, prefs) : null;
	const push = (prefs.pushTaskReminders || prefs.pushOverdueAlerts) && hasPushTarget(user.id, prefs);
	if (!to && !push) return { sent: 0 };

	const tz = user.timeZone;
	const local = utcToZoned(now, tz);
	if (!force && local.time < prefs.sendTime) return { sent: 0 };
	const today = local.date;
	let sent = 0;

	const tasks = listTasks(user.id).map((r) => ({ ...r.task, tankName: r.tankName }));
	// a routine (daily feeding, a dose on set days) is reminded on the day, not days ahead,
	// and a missed one isn't an alert: it shows as overdue in the app, and the next one comes
	const leadFor = (t: { kind: string }) => (isRoutine(t.kind) ? 0 : prefs.leadDays);

	// push: each task on its own, the same days as the emails
	if (push) {
		for (const t of tasks) {
			const d = dueInfo(t.due, today);
			const overdue = d.days < 0;
			if (overdue ? !prefs.pushOverdueAlerts : !prefs.pushTaskReminders || d.days > leadFor(t)) continue;
			if (overdue && isRoutine(t.kind)) continue;
			const key = `${overdue ? 'overdue' : 'reminder'}:${t.id}:${t.due}`;
			const ok = await pushOnce(user, prefs, key, () => taskNotice(t, d.days, overdue ? lastDone(t.id, today, tz) : null, base), base);
			if (ok) sent++;
		}
	}
	if (!to) return { sent };

	if (prefs.delivery === 'individual') {
		for (const t of tasks) {
			const d = dueInfo(t.due, today);
			const overdue = d.days < 0;
			if (overdue ? !prefs.overdueAlerts : !prefs.taskReminders || d.days > leadFor(t)) continue;
			if (overdue && isRoutine(t.kind)) continue;
			const key = `${overdue ? 'overdue' : 'reminder'}:${t.id}:${t.due}`;
			const ok = await sendOnce(
				user,
				to,
				key,
				() =>
					taskEmail({
						taskName: t.name,
						tankName: t.tankName,
						when: whenText(d.days),
						overdue,
						dueDate: longDate(t.due),
						repeats: cap(intervalText(t)),
						lastDone: overdue ? lastDone(t.id, today, tz) : null,
						doneUrl: t.kind === 'review' ? reviewUrl(t, base) : `${base}/e/${createActionToken(t.id, 'done', t.nextDue!)}`,
						review: t.kind === 'review',
						snoozeUrl: `${base}/e/${createActionToken(t.id, 'snooze', t.nextDue!)}`,
						dashboardUrl: `${base}/?tank=${t.tankId}`,
						footer: footer(user, `You're getting this because ${overdue ? 'overdue alerts' : 'task reminders'} are on.`, base)
					}),
				base
			);
			if (ok) sent++;
		}
		return { sent };
	}

	// Digest: daily, or weekly on Mondays.
	const weekly = prefs.delivery === 'weekly';
	if (weekly && new Date(today + 'T12:00:00Z').getUTCDay() !== 1 && !force) return { sent };
	const horizon = weekly ? 7 : Math.max(prefs.leadDays, 0);
	type Pending = Omit<DigestTank, 'tasks'> & { tasks: (Omit<DigestTank['tasks'][number], 'doneUrl'> & { doneUrl: () => string })[] };
	const tanksOut: Pending[] = [];
	const summary = { overdue: 0, due: 0, outOfRange: 0 };
	for (const tank of listTanks(user.id)) {
		const mine = tasks
			.filter((t) => t.tankId === tank.id)
			.map((t) => ({ t, d: dueInfo(t.due, today) }))
			.filter(({ t, d }) => (d.days < 0 ? prefs.overdueAlerts : prefs.taskReminders && d.days <= (isRoutine(t.kind) ? 0 : horizon)));
		const readings = prefs.outOfRangeAlerts ? badReadings(tank.id, user) : [];
		// what stands out: with the rest of a tank's news, or on its own in the weekly digest
		const noticed = tankNotes(tank.id, user, { limit: 3, now: now.getTime() }).map((n) => ({ text: n.text, warn: n.warn }));
		if (!mine.length && !readings.length && !(weekly && noticed.length)) continue;
		summary.overdue += mine.filter(({ d }) => d.days < 0).length;
		summary.due += mine.filter(({ d }) => d.days >= 0).length;
		summary.outOfRange += readings.length;
		tanksOut.push({
			name: tank.name,
			sub: tankSub(tank, user),
			tasks: mine.map(({ t, d }) => ({
				name: t.name,
				due: d.days < 0 ? `✕ ${whenText(d.days).replace('Overdue by', 'Overdue')}` : d.days === 0 ? '▲ Due today' : `▲ Due ${longDate(t.due)}`,
				level: d.days < 0 ? ('bad' as const) : ('warn' as const),
				// a function, so tokens are only made when the digest is really sent
				doneUrl: () => (t.kind === 'review' ? reviewUrl(t, base) : `${base}/e/${createActionToken(t.id, 'done', t.nextDue!)}`),
				review: t.kind === 'review'
			})),
			readings,
			noticed
		});
	}
	if (!tanksOut.length) return { sent };
	// "Pacific" as in E3 ("Pacific Time" → "Pacific"), not the abbreviation "PT"
	const tzName = (
		new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? tz
	).replace(/ Time$/, '');
	const [h, m] = prefs.sendTime.split(':').map(Number);
	const sendAt = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	const ok = await sendOnce(
		user,
		to,
		`${weekly ? 'weekly' : 'daily'}-digest:${today}`,
		() =>
			digestEmail({
				dateLabel: new Date(today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
				weekly,
				tanks: tanksOut.map((tank) => ({ ...tank, tasks: tank.tasks.map((t) => ({ ...t, doneUrl: t.doneUrl() })) })),
				summary,
				openUrl: base,
				sentLabel: `${weekly ? 'Weekly' : 'Daily'} digest, sent at ${sendAt} ${tzName}.`,
				footer: footer(user, '', base, 'Switch to weekly or individual emails')
			}),
		base
	);
	return { sent: ok ? sent + 1 : sent };
}

export async function runNotifications(now = new Date()) {
	if (!baseUrl()) return { sent: 0 };
	let sent = 0;
	for (const user of db.select().from(users).all()) {
		try {
			sent += (await notifyUser(user, now)).sent;
		} catch (e) {
			logger.error('email', "Reminders and digests couldn't be worked out for an account", { userId: user.id, error: e });
		}
	}
	return { sent };
}

/**
 * E4, sent right after a water test is saved (individual delivery only;
 * digests include out-of-range readings instead). Backdated tests older than
 * a day don't alert.
 */
export async function alertOutOfRange(user: User, tankId: string, testId: string) {
	const base = baseUrl();
	if (!base) return;
	const prefs = prefsFor(user.id);
	const to = emailConfigured() && prefs.outOfRangeAlerts && prefs.delivery === 'individual' ? recipient(user, prefs) : null;
	// pushed as it happens, whatever the email delivery
	const push = prefs.pushOutOfRangeAlerts && hasPushTarget(user.id, prefs);
	if (!to && !push) return;
	const test = db.select().from(tests).where(eq(tests.id, testId)).get();
	if (!test || Date.now() - Date.parse(test.takenAt) > 86_400_000) return;

	const params = new Map(listParams(tankId, { all: true }).map((p) => [p.id, p]));
	const readings = db.select().from(testReadings).where(eq(testReadings.testId, testId)).all();
	const bad = readings
		.map((r) => ({ r, p: params.get(r.parameterId)! }))
		.filter(({ p, r }) => p && statusOf(p, r.value).level === 'bad');
	if (!bad.length) return;
	const [{ p, r }, ...rest] = bad;
	const st = statusOf(p, r.value);
	const tank = listTanks(user.id).find((t) => t.id === tankId);
	if (!tank) return;

	// previous reading of the same parameter
	const prev = db
		.select({ value: testReadings.value, takenAt: tests.takenAt })
		.from(testReadings)
		.innerJoin(tests, eq(tests.id, testReadings.testId))
		.where(and(eq(tests.tankId, tankId), eq(testReadings.parameterId, p.id)))
		.orderBy(desc(tests.takenAt))
		.all()
		.find((x) => x.takenAt < test.takenAt);
	const wc = lastEventOf(tankId, 'water_change');
	const today = todayInZone(user.timeZone);
	const wcDays = wc ? daysBetween(dateInZone(wc.occurredAt, user.timeZone), today) : null;
	const loggedDay = dateInZone(test.takenAt, user.timeZone);
	const unit = paramUnit(p, user);

	if (push) {
		const more = rest.map(({ p: q, r: x }) => `${shortName(q)} ${fmtValue(q, x.value, user)}`);
		await pushOnce(
			user,
			prefs,
			`oor:${testId}`,
			() => ({
				kind: 'oor',
				title: `${p.name} is ${st.direction === 'low' ? 'low' : 'high'} in ${tank.name}: ${fmtValue(p, r.value, user)}${unit ? ` ${unit}` : ''}`,
				body: [`Target ${fmtRange(p, user)}`, more.length ? `Also out of range: ${more.join(', ')}` : null].filter(Boolean).join(' · '),
				url: `${base}/?tank=${tankId}`,
				tag: `oor-${tankId}`
			}),
			base
		);
	}
	if (!to) return;

	await sendOnce(
		user,
		to,
		`oor:${testId}`,
		() =>
			outOfRangeEmail({
				paramName: p.name,
				direction: st.direction === 'low' ? 'low' : 'high',
				tankName: tank.name,
				value: fmtValue(p, r.value, user),
				unit,
				target: fmtRange(p, user, false),
				targetWithUnit: fmtRange(p, user),
				previous: prev ? { value: fmtValue(p, prev.value, user), date: fmtDate(dateInZone(prev.takenAt, user.timeZone)) } : null,
				logged: `${loggedDay === today ? 'today' : fmtDate(loggedDay)} at ${fmtTime(test.takenAt, user.timeZone)}`,
				lastWaterChange: wcDays == null ? null : wcDays === 0 ? 'today' : `${wcDays} day${wcDays === 1 ? '' : 's'} ago`,
				dashboardUrl: `${base}/?tank=${tankId}`,
				more: rest.map(({ p: q, r: x }) => `${shortName(q)} ${fmtValue(q, x.value, user)}`),
				footer: footer(user, "You're getting this because out-of-range alerts are on. Targets are set per tank.", base)
			}),
		base
	);
}

export function unsubscribeAll(userId: string) {
	prefsFor(userId);
	db.update(notificationPrefs)
		.set({ unsubscribedAt: new Date().toISOString(), taskReminders: false, overdueAlerts: false, outOfRangeAlerts: false })
		.where(and(eq(notificationPrefs.userId, userId), isNull(notificationPrefs.unsubscribedAt)))
		.run();
}
