// Failed local-admin sign-ins per client address, kept in memory (one server
// process). Behind a reverse proxy, set ADDRESS_HEADER (and XFF_DEPTH) so the
// address is the visitor's and not the proxy's.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
	const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) failures.set(key, list);
	else failures.delete(key);
	return list;
}

/** Minutes until this address may try again, or 0 when it may try now. */
export function loginBlockedMinutes(key: string, now = Date.now()): number {
	const list = recent(key, now);
	return list.length >= MAX_FAILURES ? Math.ceil((list[0] + WINDOW_MS - now) / 60_000) : 0;
}

export function recordLoginFailure(key: string, now = Date.now()) {
	if (failures.size > 10_000) for (const k of failures.keys()) recent(k, now);
	failures.set(key, [...recent(key, now), now]);
}

export function clearLoginFailures(key: string) {
	failures.delete(key);
}

// Other endpoints anyone can call (an app registering to connect): at most
// `max` a window per address.
const hits = new Map<string, number[]>();
export function allowRate(key: string, max: number, windowMs = 60 * 60_000, now = Date.now()): boolean {
	if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
	const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (list.length >= max) return false;
	hits.set(key, [...list, now]);
	return true;
}
