// Failed local-admin sign-ins per client address, kept in memory (one server
// process). Behind a reverse proxy, set ADDRESS_HEADER (and XFF_DEPTH) so the
// address is the visitor's and not the proxy's.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

/**
 * Who an address is counted as (#215): an IPv6 address by its /64, since one
 * connection is handed a whole /64 and could otherwise come from a fresh
 * address every time. IPv4 (also written as IPv6, ::ffff:1.2.3.4) as it is.
 */
export function addressKey(address: string): string {
	const a = address.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
	if (mapped) return mapped[1];
	if (!a.includes(':')) return a;
	const [head, tail = ''] = a.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const groups = a.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
	return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

// The one local admin account, whatever address the tries come from: past this many wrong
// passwords in the window, each further try has to wait, a second longer each time up to half
// a minute. A wait, not a lock-out: the admin still gets in, and guessing from many addresses crawls.
const GLOBAL_FREE = 20;
const GLOBAL_MAX_WAIT_S = 30;
let allFailures: number[] = [];

/** Seconds until anyone may try the local admin sign-in again, or 0. */
export function loginWaitSeconds(now = Date.now()): number {
	allFailures = allFailures.filter((t) => now - t < WINDOW_MS);
	const over = allFailures.length - GLOBAL_FREE;
	if (over <= 0) return 0;
	const wait = Math.min(GLOBAL_MAX_WAIT_S, over) * 1000;
	return Math.max(0, Math.ceil((allFailures[allFailures.length - 1] + wait - now) / 1000));
}

function recent(key: string, now: number): number[] {
	const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) failures.set(key, list);
	else failures.delete(key);
	return list;
}

/**
 * Whether a path is Auth.js's local admin sign-in. Auth.js drops the empty
 * parts of a path, so /auth/callback/local/ and /auth/callback//local reach
 * the same endpoint as /auth/callback/local (#208).
 */
export const isLocalLoginPath = (pathname: string) => pathname.startsWith('/auth/') && pathname.split('/').filter(Boolean).join('/') === 'auth/callback/local';

/** Minutes until this address may try again, or 0 when it may try now. */
export function loginBlockedMinutes(address: string, now = Date.now()): number {
	const list = recent(addressKey(address), now);
	return list.length >= MAX_FAILURES ? Math.ceil((list[0] + WINDOW_MS - now) / 60_000) : 0;
}

export function recordLoginFailure(address: string, now = Date.now()) {
	const key = addressKey(address);
	if (failures.size > 10_000) for (const k of failures.keys()) recent(k, now);
	failures.set(key, [...recent(key, now), now]);
	allFailures.push(now);
}

export function clearLoginFailures(address: string) {
	failures.delete(addressKey(address));
}

/** For tests: as if nobody had tried. */
export function resetLoginLimits() {
	failures.clear();
	allFailures = [];
}

// Other endpoints anyone can call (an app registering to connect): at most
// `max` a window per key. A key that ends in an address is best made with
// addressKey, so an IPv6 /64 is one visitor.
const hits = new Map<string, number[]>();
export function allowRate(key: string, max: number, windowMs = 60 * 60_000, now = Date.now()): boolean {
	if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
	const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (list.length >= max) return false;
	hits.set(key, [...list, now]);
	return true;
}
