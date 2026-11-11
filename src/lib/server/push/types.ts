/** A push notification, the same for Web Push and ntfy. */
export interface Notice {
	kind: 'reminder' | 'overdue' | 'oor' | 'test';
	title: string;
	body: string;
	/** where a tap opens */
	url: string;
	/** a newer notice with the same tag replaces the older one on the device */
	tag: string;
	/**
	 * Mark done / Snooze, each a one-time link that works without signing in; `result` is shown once it's
	 * worked. Open (#180) just opens its page.
	 */
	actions?: { action: 'done' | 'snooze' | 'open'; title: string; url: string; result: string }[];
}
