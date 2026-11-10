// One interface for push notifications (#16), next to email's: each person's
// devices (Web Push) and their ntfy topic, if they added one. Which notices
// are pushed is decided in notifications.ts, per kind.
import { db } from '../db';
import { notificationPrefs, type User } from '../db/schema';
import { collectTokens } from '../action-tokens';
import { claimSend, sendFailed, sendSucceeded } from '../send-log';
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
	type Outcome = { to: string; ok: true } | { to: string; ok: false; error: string; detail?: string } | null;
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
				// why exactly is for an admin and the log; anyone else could map the server's network with it (#212)
				(e): Outcome => ({ to: 'ntfy', ok: false, error: user.isAdmin ? why(e) : "The ntfy server couldn't be reached, or didn't take the message", detail: why(e) })
			)
		);
	}
	// devices in the order they were added, then ntfy
	const done = (await Promise.all(jobs)).filter((o) => o !== null);
	const out: PushResult = {
		sent: done.filter((o) => o.ok).map((o) => o.to),
		failed: done.flatMap((o) => (o.ok ? [] : [{ to: o.to, error: o.error }]))
	};
	for (const o of done) if (!o.ok) logger.warn('push', `A notification to ${o.to} didn't send`, { userId: user.id, kind: notice.kind, error: o.detail ?? o.error });
	return out;
}

/**
 * Push once per (user, key), kept in the email log as "push:<key>" beside
 * the emails. When nothing got through, it's tried again later, waiting longer
 * each time, and given up after a few tries (#232): see send-log.ts.
 */
export async function pushOnce(user: User, prefs: Prefs, key: string, notice: () => Notice, origin: string): Promise<boolean> {
	const logKey = `push:${key}`;
	if (!hasPushTarget(user.id, prefs)) return false;
	if (!claimSend(user.id, logKey)) return false;
	let result: PushResult;
	let drop = () => {};
	let problem: unknown = null;
	try {
		const made = collectTokens(notice);
		drop = made.drop;
		result = await sendPush(user, prefs, made.value, origin);
	} catch (e) {
		problem = e;
		result = { sent: [], failed: [] };
	}
	if (!result.sent.length) {
		// tried again later, and its Mark done and Snooze links taken back (#232)
		drop();
		const why = problem ?? (result.failed.map((f) => `${f.to}: ${f.error}`).join('; ') || 'Nowhere to send it');
		sendFailed(user.id, logKey, why, { area: 'push', what: 'a notification' });
		return false;
	}
	sendSucceeded(user.id, logKey);
	logger.info('push', `Pushed ${key.split(':')[0]} to ${result.sent.join(', ')}`, { userId: user.id });
	return true;
}
