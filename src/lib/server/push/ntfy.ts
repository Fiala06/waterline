// ntfy (#16): a topic on ntfy.sh or a self-hosted ntfy server, read in the
// ntfy app. The topic's address is the secret (anyone who knows it can read
// it), or the server asks for an access token. Published as JSON to the
// server's root, with the topic named inside.
import type { Notice } from './types';

/** A topic's address: https://ntfy.sh/<topic>, or on a server of your own (http is fine on a home network). */
export function parseTopicUrl(raw: string): { server: string; topic: string } | null {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.username || u.password || u.search || u.hash) return null;
	const parts = u.pathname.split('/').filter(Boolean);
	const topic = parts.pop();
	// ntfy's topic names: letters, digits, _ and -, up to 64
	if (!topic || !/^[\w-]{1,64}$/.test(topic)) return null;
	return { server: `${u.origin}${parts.length ? `/${parts.join('/')}` : ''}`, topic };
}

/** ntfy's tag names, shown as emoji: ⚠️ for an alert, ⏰ for a reminder. */
const TAGS: Record<Notice['kind'], string[]> = { oor: ['warning'], overdue: ['alarm_clock'], reminder: ['alarm_clock'], test: ['fish'] };

export function ntfyMessage(topic: string, notice: Notice) {
	return {
		topic,
		title: notice.title,
		message: notice.body,
		click: notice.url,
		tags: TAGS[notice.kind],
		priority: notice.kind === 'oor' ? 4 : 3,
		// Mark done / Snooze post the one-time link from the ntfy app
		actions: (notice.actions ?? []).map((a) => ({
			action: 'http',
			label: a.title,
			url: a.url,
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: '',
			clear: true
		}))
	};
}

export async function sendNtfy(topicUrl: string, token: string | null, notice: Notice, fetcher: typeof fetch = fetch) {
	const t = parseTopicUrl(topicUrl);
	if (!t) throw new Error("The ntfy topic's address isn't valid");
	const res = await fetcher(t.server, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
		body: JSON.stringify(ntfyMessage(t.topic, notice)),
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) {
		const why = res.status === 401 || res.status === 403 ? ': it needs an access token, or this one is wrong' : '';
		throw new Error(`The ntfy server answered ${res.status}${why}`);
	}
}
