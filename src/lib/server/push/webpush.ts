// Web Push (#16): the installed app, or the browser, on each device. The
// server's VAPID keys are made on first use and kept in server_settings (the
// private one encrypted); a device subscribes with the public one. Payloads
// are encrypted for the device, so the push service can't read them.
import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { db } from '../db';
import { pushSubscriptions, serverSettings } from '../db/schema';
import { getServerSettings } from '../mail';
import { decrypt, encrypt } from '../secrets';
import type { Notice } from './types';

export type Subscription = typeof pushSubscriptions.$inferSelect;

/** The server's VAPID keys, made the first time they're needed. */
export function vapidKeys(): { publicKey: string; privateKey: string } {
	const s = getServerSettings();
	const privateKey = decrypt(s.vapidPrivateKeyEnc);
	if (s.vapidPublicKey && privateKey) return { publicKey: s.vapidPublicKey, privateKey };
	// none yet, or unreadable after the encryption key changed: devices need adding again
	const keys = webpush.generateVAPIDKeys();
	db.update(serverSettings).set({ vapidPublicKey: keys.publicKey, vapidPrivateKeyEnc: encrypt(keys.privateKey) }).where(eq(serverSettings.id, 1)).run();
	if (s.vapidPublicKey) db.delete(pushSubscriptions).run();
	return keys;
}

/**
 * Push services the browsers use: Chrome, Edge, Samsung and others (FCM),
 * Firefox, Safari, and Windows. The server posts only to these, never to an
 * address a browser made up. Tests also post to this machine.
 */
const PUSH_HOSTS = /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
export function allowedEndpoint(endpoint: string, dev = env.AUTH_DEV_LOGIN === 'true'): boolean {
	let u: URL;
	try {
		u = new URL(endpoint);
	} catch {
		return false;
	}
	if (dev && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
	return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
}

/** "Chrome on Android", "Safari on iPhone": which device a subscription is. */
export function deviceLabel(ua: string): string {
	const os = /iPhone/.test(ua)
		? 'iPhone'
		: /iPad/.test(ua)
			? 'iPad'
			: /Android/.test(ua)
				? 'Android'
				: /Windows/.test(ua)
					? 'Windows'
					: /Mac OS X|Macintosh/.test(ua)
						? 'Mac'
						: /CrOS/.test(ua)
							? 'Chromebook'
							: /Linux/.test(ua)
								? 'Linux'
								: null;
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /SamsungBrowser/.test(ua)
			? 'Samsung Internet'
			: /OPR\//.test(ua)
				? 'Opera'
				: /Firefox\/|FxiOS/.test(ua)
					? 'Firefox'
					: /Chrome\/|CriOS/.test(ua)
						? 'Chrome'
						: /Safari\//.test(ua)
							? 'Safari'
							: null;
	if (browser && os) return `${browser} on ${os}`;
	return browser ?? os ?? 'A browser';
}

export function listSubscriptions(userId: string): Subscription[] {
	return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(pushSubscriptions.createdAt).all();
}

/** Add a device, or move it to this account (a shared computer); `replaces` is its old subscription, when the browser renewed it. */
export function addSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }, label: string, replaces?: string | null) {
	if (replaces && replaces !== sub.endpoint) {
		db.delete(pushSubscriptions)
			.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, replaces)))
			.run();
	}
	return db
		.insert(pushSubscriptions)
		.values({ userId, ...sub, label })
		.onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth, label } })
		.returning()
		.get();
}

export function removeSubscription(userId: string, id: string) {
	return db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, id)))
		.run().changes;
}

/** Who push services can contact about this server: the admin, else its https address (they take nothing else). */
export function subject(origin: string, admin = getServerSettings().adminEmail || env.ADMIN_EMAIL) {
	if (admin) return `mailto:${admin}`;
	return origin.startsWith('https://') ? origin : 'mailto:waterline@localhost';
}

/**
 * Send one notice to one device. A device that's gone (unsubscribed, the app
 * removed) is forgotten; other failures throw, for the caller to log.
 */
export async function sendWebPush(sub: Subscription, notice: Notice, origin: string, fetcher: typeof fetch = fetch): Promise<'sent' | 'gone'> {
	if (!allowedEndpoint(sub.endpoint)) {
		db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
		return 'gone';
	}
	const keys = vapidKeys();
	const req = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(notice), {
		vapidDetails: { subject: subject(origin), publicKey: keys.publicKey, privateKey: keys.privateKey },
		// a reminder a day late is no use; an alert, a bit longer
		TTL: notice.kind === 'oor' ? 2 * 86_400 : 86_400,
		urgency: notice.kind === 'oor' ? 'high' : 'normal',
		// the same notice again replaces the one still waiting
		topic: notice.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined
	});
	const res = await fetcher(req.endpoint, {
		method: req.method,
		headers: req.headers as Record<string, string>,
		body: req.body ? new Uint8Array(req.body) : undefined,
		signal: AbortSignal.timeout(10_000)
	});
	if (res.status === 404 || res.status === 410) {
		db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
		return 'gone';
	}
	if (!res.ok) throw new Error(`The push service answered ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`.trim());
	db.update(pushSubscriptions).set({ lastSentAt: new Date().toISOString() }).where(eq(pushSubscriptions.id, sub.id)).run();
	return 'sent';
}
