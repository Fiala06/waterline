// One interface for push notifications (#16), next to email's: each person's
// devices (Web Push) and their ntfy topic, if they added one. Which notices
// are pushed is decided in notifications.ts, per kind.
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { emailLog, notificationPrefs, type User } from '../db/schema';
import { logger } from '../log';
import { decrypt } from '../secrets';
import { sendNtfy } from './ntfy';
import type { Notice } from './types';
import { listSubscriptions, sendWebPush } from './webpush';

export type { Notice };
type Prefs = typeof notificationPrefs.$inferSelect;

/** Somewhere to push to: a device, or an ntfy topic. */
export const hasPushTarget = (userId: string, prefs: Prefs) => !!prefs.ntfyUrl || listSubscriptions(userId).length > 0;

export interface PushResult {
	/** "Chrome on Android", "ntfy" */
	sent: string[];
	failed: { to: string; error: string }[];
}

/** Push one notice everywhere this person gets them. */
export async function sendPush(user: User, prefs: Prefs, notice: Notice, origin: string, fetcher: typeof fetch = fetch): Promise<PushResult> {
	type Outcome = { to: string; ok: true } | { to: string; ok: false; error: string } | null;
	const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
	const jobs: Promise<Outcome>[] = listSubscriptions(user.id).map(async (sub): Promise<Outcome> => {
		try {
			if ((await sendWebPush(sub, notice, origin, fetcher)) === 'sent') return { to: sub.label, ok: true };
			logger.info('push', `Removed ${sub.label}: it no longer gets notifications`, { userId: user.id });
			return null;
		} catch (e) {
			return { to: sub.label, ok: false, error: why(e) };
		}
	});
	if (prefs.ntfyUrl) {
		jobs.push(
			sendNtfy(prefs.ntfyUrl, decrypt(prefs.ntfyTokenEnc), notice, fetcher).then(
				(): Outcome => ({ to: 'ntfy', ok: true }),
				(e): Outcome => ({ to: 'ntfy', ok: false, error: why(e) })
			)
		);
	}
	// devices in the order they were added, then ntfy
	const done = (await Promise.all(jobs)).filter((o) => o !== null);
	const out: PushResult = {
		sent: done.filter((o) => o.ok).map((o) => o.to),
		failed: done.flatMap((o) => (o.ok ? [] : [{ to: o.to, error: o.error }]))
	};
	for (const f of out.failed) logger.warn('push', `A notification to ${f.to} didn't send`, { userId: user.id, kind: notice.kind, error: f.error });
	return out;
}

/**
 * Push once per (user, key), kept in the email log as "push:<key>" beside
 * the emails. When nothing got through, it's forgotten, so the next run retries.
 */
export async function pushOnce(user: User, prefs: Prefs, key: string, notice: () => Notice, origin: string): Promise<boolean> {
	const logKey = `push:${key}`;
	if (!hasPushTarget(user.id, prefs)) return false;
	const inserted = db.insert(emailLog).values({ userId: user.id, key: logKey }).onConflictDoNothing().run();
	if (inserted.changes === 0) return false;
	let result: PushResult;
	try {
		result = await sendPush(user, prefs, notice(), origin);
	} catch (e) {
		logger.error('push', "A notification couldn't be made", { userId: user.id, key, error: e });
		result = { sent: [], failed: [] };
	}
	if (!result.sent.length) {
		db.delete(emailLog)
			.where(and(eq(emailLog.userId, user.id), eq(emailLog.key, logKey)))
			.run();
		return false;
	}
	logger.info('push', `Pushed ${key.split(':')[0]} to ${result.sent.join(', ')}`, { userId: user.id });
	return true;
}
