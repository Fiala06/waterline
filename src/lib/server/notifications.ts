// Decides what to email and push, and when. Runs every few minutes (see
// scheduler.ts); each user's notices go out at their send time in their time
// zone, and the email log makes every send happen at most once. Email and push
// have their own switches per kind; push is one notice at a time, whatever the
// email delivery (digests are email only), and doesn't need email set up.
import { and, desc, eq, gt, isNull, like, lt, or } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { fmtRange, fmtValue, paramUnit, shortName, statusOf } from '$lib/params';
import { dueInfo, intervalText, isRoutine } from '$lib/tasks';
import { addDays, dateInZone, daysBetween, fmtDate, fmtTime, fmtWeekday, fmtWhen, todayInZone, utcToZoned } from '$lib/time';
import { formatNumber, toDisplay, unitLabel } from '$lib/units';
import { collectTokens, createActionToken } from './action-tokens';
import { claimSend, sendFailed, sendSucceeded } from './send-log';
import { db } from './db';
import { logger } from './log';
import { emailLog, notificationPrefs, tankParameters, tanks, taskCompletions, tests, testReadings, users, type Tank, type TankParameter, type User } from './db/schema';
import { lastEventOf, latestReadings } from './logs';
import { emailConfigured, sendMail } from './mail';
import { digestEmail, outOfRangeEmail, taskEmail, type DigestTank, type Footer, type Rendered } from './mail/templates';
import { hasPushTarget, pushOnce, type Notice } from './push';
import { tankNotes } from './trends';
import { sign } from './secrets';
import { notifiesUser, tankPeople } from './members';
import { isLive, latestSamplesFor, outOfRangeSince } from './sensors';
import { getUser, maySignIn } from './users';
import { listParams, listTanks, roleOn } from './tanks';
import { listTasks, settleTasks } from './tasks';
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

/**
 * Send once per (user, key). A failed send is tried again later, waiting longer
 * each time, and given up after a few tries (#232); its Mark done and Snooze
 * links are taken back, so only a sent email leaves any.
 */
async function sendOnce(user: User, to: string, key: string, render: () => Rendered, base: string) {
	if (!claimSend(user.id, key)) return false;
	let drop = () => {};
	try {
		const made = collectTokens(render);
		drop = made.drop;
		const r = made.value;
		const unsub = `${base}/unsubscribe/${unsubscribeToken(user.id)}`;
		await sendMail({
			to,
			subject: r.subject,
			html: r.html,
			text: r.text,
			headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
		});
		sendSucceeded(user.id, key);
		logger.info('email', `Sent ${emailKind(key)}`, { userId: user.id });
		return true;
	} catch (e) {
		drop();
		sendFailed(user.id, key, e, { area: 'email', what: emailKind(key) });
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

const longDate = (d: string) => fmtWeekday(d);
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
		// a skip (#71) wasn't doing it
		.where(and(eq(taskCompletions.taskId, taskId), eq(taskCompletions.skipped, false)))
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
function taskNotice(user: Pick<User, 'id'>, t: { id: string; name: string; kind: string; tankId: string; tankName: string; nextDue: string | null }, days: number, lastDoneText: string | null, base: string): Notice {
	const overdue = days < 0;
	const review = t.kind === 'review';
	const snooze = { action: 'snooze' as const, title: 'Snooze', url: `${base}/e/${createActionToken(t.id, 'snooze', t.nextDue!, user.id)}`, result: `Snoozed ${t.name} for a day` };
	return {
		kind: overdue ? 'overdue' : 'reminder',
		title: `${whenText(days)}: ${t.name}`,
		body: [t.tankName, lastDoneText && `Last done ${lastDoneText}`].filter(Boolean).join(' · '),
		// a review opens its page; there's nothing to mark done from the notification
		url: review ? reviewUrl(t, base) : `${base}/?tank=${t.tankId}`,
		tag: `task-${t.id}`,
		actions: review
			? [snooze]
			: [{ action: 'done', title: 'Mark done', url: `${base}/e/${createActionToken(t.id, 'done', t.nextDue!, user.id)}`, result: `✓ ${t.name} done` }, snooze]
	};
}

/** The latest a day's emails and pushes can be set to go: the scheduler runs every 5 minutes. */
const LATEST_SEND = '23:50';

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
	// the send time is on the hour; one saved later than the day's last run of the scheduler would never come (#231)
	if (!force && local.time < (prefs.sendTime > LATEST_SEND ? LATEST_SEND : prefs.sendTime)) return { sent: 0 };
	const today = local.date;
	let sent = 0;

	// a shared tank (#22): its reminders go to everyone who can log, or the owner only, as its owner set
	const tankRows = new Map(listTanks(user.id).map((t) => [t.id, t]));
	const notified = (tankId: string, kind: 'remind' | 'alert') => {
		const t = tankRows.get(tankId);
		return !!t && notifiesUser(t, user.id, kind, roleOn(user.id, t));
	};
	settleTasks(user.id, user.timeZone);
	const tasks = listTasks(user.id)
		.filter((r) => notified(r.task.tankId, 'remind'))
		.map((r) => ({ ...r.task, tankName: r.tankName }));
	// each tank's tasks, grouped once for the digest
	const tasksIn = Map.groupBy(tasks, (t) => t.tankId);
	// a routine (daily feeding, a dose on set days) is reminded on the day, not days ahead,
	// and a missed one isn't an alert: it shows as overdue in the app, and the next one comes
	const leadFor = (t: { kind: string }) => (isRoutine(t.kind) ? 0 : prefs.leadDays);

	// push: each task on its own, the same days as the emails
	if (push) {
		for (const t of tasks) {
			const d = dueInfo(t.due, today, t.graceDays);
			const overdue = d.section === 'overdue';
			// a day or so late, within its grace (#175): reminded on the day, no alert yet
			if (!overdue && d.days < 0) continue;
			if (overdue ? !prefs.pushOverdueAlerts : !prefs.pushTaskReminders || d.days > leadFor(t)) continue;
			if (overdue && isRoutine(t.kind)) continue;
			const key = `${overdue ? 'overdue' : 'reminder'}:${t.id}:${t.due}`;
			const ok = await pushOnce(user, prefs, key, () => taskNotice(user, t, d.days, overdue ? lastDone(t.id, today, tz) : null, base), base);
			if (ok) sent++;
		}
	}
	if (!to) return { sent };

	if (prefs.delivery === 'individual') {
		for (const t of tasks) {
			const d = dueInfo(t.due, today, t.graceDays);
			const overdue = d.section === 'overdue';
			if (!overdue && d.days < 0) continue;
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
						doneUrl: t.kind === 'review' ? reviewUrl(t, base) : `${base}/e/${createActionToken(t.id, 'done', t.nextDue!, user.id)}`,
						review: t.kind === 'review',
						snoozeUrl: `${base}/e/${createActionToken(t.id, 'snooze', t.nextDue!, user.id)}`,
						dashboardUrl: `${base}/?tank=${t.tankId}`,
						footer: footer(user, `You're getting this because ${overdue ? 'overdue alerts' : 'task reminders'} are on.`, base)
					}),
				base
			);
			if (ok) sent++;
		}
		return { sent };
	}

	// Digest: daily, or weekly on Mondays. A Monday the server missed after the send time
	// is made up on Tuesday (#231): the week's digest is sent once, keyed by its Monday.
	const weekly = prefs.delivery === 'weekly';
	const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
	if (weekly && weekday !== 1 && weekday !== 2 && !force) return { sent };
	const digestDay = weekly && weekday === 2 ? addDays(today, -1) : today;
	const horizon = weekly ? 7 : Math.max(prefs.leadDays, 0);
	type Pending = Omit<DigestTank, 'tasks'> & { tasks: (Omit<DigestTank['tasks'][number], 'doneUrl'> & { doneUrl: () => string })[] };
	const tanksOut: Pending[] = [];
	const summary = { overdue: 0, due: 0, outOfRange: 0 };
	for (const tank of listTanks(user.id)) {
		const mine = (tasksIn.get(tank.id) ?? [])
			.map((t) => ({ t, d: dueInfo(t.due, today, t.graceDays) }))
			.filter(({ t, d }) => (d.section === 'overdue' ? prefs.overdueAlerts : prefs.taskReminders && d.days <= (isRoutine(t.kind) ? 0 : horizon)));
		const readings = prefs.outOfRangeAlerts && notified(tank.id, 'alert') ? badReadings(tank.id, user) : [];
		// what stands out: with the rest of a tank's news, or on its own in the weekly digest
		const noticed = tankNotes(tank.id, user, { limit: 3, now: now.getTime() }).map((n) => ({ text: n.text, warn: n.warn }));
		if (!mine.length && !readings.length && !(weekly && noticed.length)) continue;
		summary.overdue += mine.filter(({ d }) => d.section === 'overdue').length;
		summary.due += mine.filter(({ d }) => d.section !== 'overdue').length;
		summary.outOfRange += readings.length;
		tanksOut.push({
			name: tank.name,
			sub: tankSub(tank, user),
			tasks: mine.map(({ t, d }) => ({
				name: t.name,
				due: d.section === 'overdue' ? `✕ ${whenText(d.days).replace('Overdue by', 'Overdue')}` : d.days < 0 ? d.text : d.days === 0 ? '▲ Due today' : `▲ Due ${longDate(t.due)}`,
				level: d.section === 'overdue' ? ('bad' as const) : ('warn' as const),
				// a function, so tokens are only made when the digest is really sent
				doneUrl: () => (t.kind === 'review' ? reviewUrl(t, base) : `${base}/e/${createActionToken(t.id, 'done', t.nextDue!, user.id)}`),
				review: t.kind === 'review'
			})),
			readings,
			noticed
		});
	}
	if (!tanksOut.length) {
		// a Monday with nothing to say still counts as the week's digest, so Tuesday doesn't send one
		if (weekly && !force) db.insert(emailLog).values({ userId: user.id, key: `weekly-digest:${digestDay}` }).onConflictDoNothing().run();
		return { sent };
	}
	// "Pacific" as in E3 ("Pacific Time" → "Pacific"), not the abbreviation "PT"
	const tzName = (
		new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? tz
	).replace(/ Time$/, '');
	const [h, m] = prefs.sendTime.split(':').map(Number);
	const sendAt = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	const ok = await sendOnce(
		user,
		to,
		`${weekly ? 'weekly' : 'daily'}-digest:${digestDay}`,
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
		// nothing goes to someone who was locked out, least of all working Mark done / Snooze links (#209)
		if (!maySignIn(user)) continue;
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
	const test = db.select().from(tests).where(eq(tests.id, testId)).get();
	if (!test || Date.now() - Date.parse(test.takenAt) > 86_400_000) return;
	const params = new Map(listParams(tankId, { all: true }).map((p) => [p.id, p]));
	const readings = db.select().from(testReadings).where(eq(testReadings.testId, testId)).all();
	const bad = readings
		.map((r) => ({ p: params.get(r.parameterId)!, value: r.value }))
		.filter(({ p, value }) => p && statusOf(p, value).level === 'bad');
	if (!bad.length) return;
	const tank = listTanks(user.id).find((t) => t.id === tankId);
	if (!tank) return;
	// everyone the tank alerts (#229), as a sensor's reading does: on a shared tank that's the owner
	// and whoever else it's set to, not only the person who typed the reading; times in each one's zone
	for (const userId of tankPeople(tank).keys()) {
		const person = userId === user.id ? user : getUser(userId);
		if (!person || !maySignIn(person) || !notifiesUser(tank, userId, 'alert', roleOn(userId, tank))) continue;
		const today = todayInZone(person.timeZone);
		const loggedDay = dateInZone(test.takenAt, person.timeZone);
		const by = userId === user.id ? '' : ` by ${user.displayName || user.email.split('@')[0]}`;
		await notifyOutOfRange(
			person,
			tank,
			`oor:${testId}`,
			bad,
			{ at: test.takenAt, logged: `${loggedDay === today ? 'today' : fmtDate(loggedDay)} at ${fmtTime(test.takenAt, person.timeZone)}${by}` },
			base
		).catch((e) => logger.error('email', "A test's out-of-range alert didn't send", { userId, tankId: tank.id, error: e }));
	}
}

/** How long a sensor that is the reading of record reads out of range before its alert goes, and the readings it takes. */
export const EXCURSION_MS = 15 * 60_000;
export const EXCURSION_READINGS = 2;
/** How long after a sensor's alert for a parameter before the next one for it may go to the same person. */
export const EXCURSION_COOLDOWN_MS = 6 * 3_600_000;

/** Whether this person was sent a sensor's out-of-range alert for the parameter, by email or push, in the last few hours. */
function alertedLately(userId: string, parameterId: string, now: number): boolean {
	const since = new Date(now - EXCURSION_COOLDOWN_MS).toISOString();
	const key = `oor:sensor:${parameterId}:`;
	return !!db
		.select({ id: emailLog.id })
		.from(emailLog)
		// a send still waiting to be tried again (#232) hasn't alerted anyone
		.where(and(eq(emailLog.userId, userId), or(like(emailLog.key, `${key}%`), like(emailLog.key, `push:${key}%`)), gt(emailLog.sentAt, since), isNull(emailLog.retryAt)))
		.get();
}

/**
 * Sensors that are the reading of record (Parameters & targets) and have read
 * out of range for a while: the alert a test would raise, to everyone the
 * tank alerts, once per stretch out of range (its key is when the stretch
 * began). A stretch isn't over at the first reading back inside the target,
 * only once the sensor has stayed there a while (see outOfRangeSince), and a
 * parameter alerts a person at most once every few hours (#228), so a heater
 * cycling around its limit isn't an alert on every cycle. A sensor gone quiet
 * doesn't alert on its last reading.
 */
export async function alertSensorExcursions(now = Date.now()) {
	const base = baseUrl();
	if (!base) return;
	const rows = db
		.select({ p: tankParameters, tank: tanks })
		.from(tankParameters)
		.innerJoin(tanks, eq(tanks.id, tankParameters.tankId))
		.where(and(eq(tankParameters.sensorRecord, true), isNull(tanks.archivedAt)))
		.all();
	if (!rows.length) return;
	const samples = latestSamplesFor([...new Set(rows.map((r) => r.tank.id))]);
	for (const { p, tank } of rows) {
		const s = samples.get(tank.id)?.get(p.id);
		if (!s || !isLive(s.at, s.prevAt, now)) continue;
		const st = statusOf(p, s.value);
		if (st.level !== 'bad') continue;
		// a newer hand-logged test is the reading instead
		const r = latestReadings(tank.id).get(p.id);
		if (!r || !r.sensor) continue;
		const run = outOfRangeSince(tank.id, p.id, p);
		// one that began before the readings looked through was alerted long ago
		if (!run || run.old || run.count < EXCURSION_READINGS || now - Date.parse(run.since) < EXCURSION_MS) continue;
		for (const userId of tankPeople(tank).keys()) {
			const user = getUser(userId);
			if (!user || !notifiesUser(tank, userId, 'alert', roleOn(userId, tank))) continue;
			// and at most one alert per parameter every few hours, however it comes and goes (#228)
			if (alertedLately(userId, p.id, now)) continue;
			const direction = st.direction === 'low' ? 'low' : 'high';
			await notifyOutOfRange(
				user,
				tank,
				`oor:sensor:${p.id}:${run.since}`,
				[{ p, value: s.value }],
				{ at: s.at, logged: `by ${s.source} at ${fmtTime(s.at, user.timeZone)}, ${direction} since ${fmtWhen(run.since, user.timeZone).replace(/^Today, /, '')}` },
				base
			).catch((e) => logger.error('email', "The sensor's out-of-range alert didn't send", { userId, tankId: tank.id, error: e }));
		}
	}
}

/**
 * E4: the out-of-range alert itself, by push as it happens and by email when
 * delivery is individual (digests include out-of-range readings instead), each
 * once per key. The first out-of-range reading leads; the rest are "also".
 */
async function notifyOutOfRange(user: User, tank: Tank, key: string, bad: { p: TankParameter; value: number }[], when: { at: string; logged: string }, base: string) {
	const prefs = prefsFor(user.id);
	const to = emailConfigured() && prefs.outOfRangeAlerts && prefs.delivery === 'individual' ? recipient(user, prefs) : null;
	// pushed as it happens, whatever the email delivery
	const push = prefs.pushOutOfRangeAlerts && hasPushTarget(user.id, prefs);
	if (!to && !push) return;
	const [{ p, value }, ...rest] = bad;
	const st = statusOf(p, value);
	// previous test of the same parameter
	const prev = db
		.select({ value: testReadings.value, takenAt: tests.takenAt })
		.from(testReadings)
		.innerJoin(tests, eq(tests.id, testReadings.testId))
		.where(and(eq(tests.tankId, tank.id), eq(testReadings.parameterId, p.id), lt(tests.takenAt, when.at)))
		.orderBy(desc(tests.takenAt))
		.limit(1)
		.get();
	const wc = lastEventOf(tank.id, 'water_change');
	const today = todayInZone(user.timeZone);
	const wcDays = wc ? daysBetween(dateInZone(wc.occurredAt, user.timeZone), today) : null;
	const unit = paramUnit(p, user);
	const more = rest.map(({ p: q, value: x }) => `${shortName(q)} ${fmtValue(q, x, user)}`);

	if (push) {
		await pushOnce(
			user,
			prefs,
			key,
			() => ({
				kind: 'oor',
				title: `${p.name} is ${st.direction === 'low' ? 'low' : 'high'} in ${tank.name}: ${fmtValue(p, value, user)}${unit ? ` ${unit}` : ''}`,
				body: [`Target ${fmtRange(p, user)}`, more.length ? `Also out of range: ${more.join(', ')}` : null].filter(Boolean).join(' · '),
				url: `${base}/?tank=${tank.id}`,
				tag: `oor-${tank.id}`
			}),
			base
		);
	}
	if (!to) return;

	await sendOnce(
		user,
		to,
		key,
		() =>
			outOfRangeEmail({
				paramName: p.name,
				direction: st.direction === 'low' ? 'low' : 'high',
				tankName: tank.name,
				value: fmtValue(p, value, user),
				unit,
				target: fmtRange(p, user, false),
				targetWithUnit: fmtRange(p, user),
				previous: prev ? { value: fmtValue(p, prev.value, user), date: fmtDate(dateInZone(prev.takenAt, user.timeZone)) } : null,
				logged: when.logged,
				lastWaterChange: wcDays == null ? null : wcDays === 0 ? 'today' : `${wcDays} day${wcDays === 1 ? '' : 's'} ago`,
				dashboardUrl: `${base}/?tank=${tank.id}`,
				more,
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
