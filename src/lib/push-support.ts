// Whether this browser can get Web Push (#16, #310), and its subscription.
// Reads only: it never asks for permission, which waits for the keeper's tap.

export type PushSupport = 'checking' | 'insecure' | 'ios' | 'unsupported' | 'denied' | 'ready';

/** This device's state, and its subscription's endpoint when it has one. */
export async function detectPush(): Promise<{ support: Exclude<PushSupport, 'checking'>; endpoint: string | null }> {
	const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	if (!isSecureContext) return { support: 'insecure', endpoint: null };
	if (!('PushManager' in window) || !('serviceWorker' in navigator) || !('Notification' in window)) return { support: ios ? 'ios' : 'unsupported', endpoint: null };
	if (Notification.permission === 'denied') return { support: 'denied', endpoint: null };
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		return { support: 'ready', endpoint: (await reg?.pushManager.getSubscription())?.endpoint ?? null };
	} catch {
		return { support: 'ready', endpoint: null };
	}
}

/** What to say when this device can't get push, by state. */
export const PUSH_NOTE: Partial<Record<string, string>> = {
	insecure: 'Push to this device needs Waterline on HTTPS. ntfy, below, works either way.',
	ios: 'On iPhone and iPad, add Waterline to your Home Screen first (Share › Add to Home Screen), then open it from there and turn this on.',
	unsupported: "This browser can't get push notifications. ntfy, below, works on any phone.",
	denied: "Notifications are blocked for Waterline in this browser. Allow them in the browser's site settings, then come back here."
};
