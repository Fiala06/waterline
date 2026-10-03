import { redirect, type Handle, type HandleServerError, type ServerInit } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { building } from '$app/environment';
import { startScheduler } from '$lib/server/scheduler';
import { failInterruptedExports } from '$lib/server/export';
import { sequence } from '@sveltejs/kit/hooks';
import { checkAuthConfig, devLoginEnabled, handle as authHandle } from './auth';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { getUser, isEmailAllowed } from '$lib/server/users';
import { touchLastSeen } from '$lib/server/people';
import { publicSettings } from '$lib/server/public';
import { announceSetup } from '$lib/server/setup';
import { logger } from '$lib/server/log';
import { VERSION } from '$lib/changelog';
import { preloadsInHead } from '$lib/server/preloads';

const PUBLIC_PATHS = ['/signin', '/first-run', '/auth', '/e', '/invite', '/unsubscribe', '/t', '/s', '/p', '/public', '/sitemap.xml', '/robots.txt', '/mcp', '/api/v1', '/.well-known', '/oauth/register', '/oauth/token', '/cal'];
/** For AI assistants (#9): signed in by an access token, never the session cookie. */
const TOKEN_PATHS = ['/mcp', '/api/v1'];
/** Where apps register and get tokens (OAuth): no cookies, so any site may call them. */
const OAUTH_PATHS = ['/oauth/register', '/oauth/token'];

/**
 * Only this site may post to it (the check SvelteKit normally does, for every
 * content type). Exceptions: one-click unsubscribe, which mail providers POST
 * without an Origin, the test-only /dev endpoints (404 unless AUTH_DEV_LOGIN),
 * an AI assistant's calls without an Origin: they carry an access token, not
 * cookies (a web page elsewhere sends an Origin, and is still refused), and
 * the OAuth registration and token endpoints, which don't use cookies at all,
 * and Mark done / Snooze from a notification in the ntfy app (/e/<one-time
 * link>, which needs no cookies either) without an Origin.
 */
const csrf: Handle = ({ event, resolve }) => {
	const { request, url } = event;
	if (
		!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
		request.headers.get('origin') !== url.origin &&
		!url.pathname.startsWith('/unsubscribe/') &&
		!url.pathname.startsWith('/dev/') &&
		!(request.headers.get('origin') === null && TOKEN_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) &&
		!(request.headers.get('origin') === null && url.pathname.startsWith('/e/')) &&
		!OAUTH_PATHS.includes(url.pathname)
	) {
		return new Response(`Cross-site ${request.method} requests are forbidden`, { status: 403 });
	}
	return resolve(event);
};

/**
 * The log forms moved from /log/test and /log/event to /entries/…/new: ad
 * blockers' privacy lists block posts to /log/event?…. Old links, and pages
 * still running the previous version, follow; 308 keeps a POST a POST. The
 * request's own URL, since event.url drops a data request's /__data.json.
 */
const movedPaths: Handle = ({ event, resolve }) => {
	const url = new URL(event.request.url);
	const moved = url.pathname.replace(/^\/log\/(test|event)(?=\/|$)/, '/entries/$1/new');
	if (moved === url.pathname) return resolve(event);
	return new Response(null, { status: 308, headers: { location: moved + url.search } });
};

/**
 * Plain-HTTP servers (ORIGIN=http://…, e.g. LAN-only): SvelteKit marks cookies
 * Secure everywhere but localhost, and browsers drop Secure cookies sent over HTTP.
 */
const httpCookies: Handle = ({ event, resolve }) => {
	if (event.url.protocol === 'http:') {
		const { cookies } = event;
		const set = cookies.set.bind(cookies);
		const del = cookies.delete.bind(cookies);
		cookies.set = (name, value, opts) => set(name, value, { secure: false, ...opts });
		cookies.delete = (name, opts) => del(name, { secure: false, ...opts });
	}
	return resolve(event);
};

/**
 * Auth.js also takes local admin logins at /auth/callback/local directly; the
 * sign-in page's own action applies the same limit with a friendlier message.
 */
const loginLimit: Handle = async ({ event, resolve }) => {
	if (event.request.method !== 'POST' || event.url.pathname !== '/auth/callback/local') return resolve(event);
	const address = event.getClientAddress();
	const wait = loginBlockedMinutes(address);
	if (wait) return new Response('Too many sign-in attempts. Try again later.', { status: 429, headers: { 'retry-after': String(wait * 60) } });
	const res = await resolve(event);
	if (/session-token=[^;]/.test(res.headers.get('set-cookie') ?? '')) clearLoginFailures(address);
	else recordLoginFailure(address);
	return res;
};

/**
 * Headers for every response: no framing, no sniffing, and no Referer to other
 * sites (email-link tokens stay here). Not no-referrer: that makes browsers send
 * "Origin: null" on this site's own forms, which the check above refuses.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	const url = event.url;
	const set = (k: string, v: string) => {
		try {
			if (!res.headers.has(k)) res.headers.set(k, v);
		} catch {
			/* immutable headers (e.g. a fetched response) */
		}
	};
	set('x-frame-options', 'DENY');
	set('x-content-type-options', 'nosniff');
	set('referrer-policy', 'same-origin');
	// the app never uses these browser features (photos come through <input type=file>)
	set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
	if (url.protocol === 'https:') set('strict-transport-security', 'max-age=31536000');
	return res;
};

/** Browser bar color: the page background of the chosen theme, or both for "system". */
function themeColorMeta(theme: string) {
	const dark = '<meta name="theme-color" content="#161514" />';
	const light = '<meta name="theme-color" content="#f3f2f2" />';
	if (theme === 'dark') return dark;
	if (theme === 'light') return light;
	return `${dark.replace(' />', ' media="(prefers-color-scheme: dark)" />')}${light.replace(' />', ' media="(prefers-color-scheme: light)" />')}`;
}

const isPublic = (path: string) => path === '/dev/seed' || path === '/dev/next-release' || path.startsWith('/dev/wiki/') || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

const appHandle: Handle = async ({ event, resolve }) => {
	// Background sync of offline entries: no "Saved" toast per replayed entry.
	if (event.request.headers.get('x-waterline-sync') === '1') {
		const set = event.cookies.set.bind(event.cookies);
		event.cookies.set = (name, value, opts) => {
			if (name !== 'wl_flash') set(name, value, opts);
		};
	}

	const session = await event.locals.auth();
	const uid = session?.user?.id;
	let found = uid ? (getUser(uid) ?? null) : null;
	// Sign out everywhere (#27): a session that began before the admin signed them out is no longer good
	const signedInAt = (session?.user as { signedInAt?: number } | undefined)?.signedInAt;
	if (found?.sessionsRevokedAt && typeof signedInAt === 'number' && signedInAt * 1000 < Date.parse(found.sessionsRevokedAt)) found = null;
	// Someone taken off ALLOWED_EMAILS, or whose invitation was revoked, is signed out on their next request.
	event.locals.user = found && (devLoginEnabled() || isEmailAllowed(found.email)) ? found : null;
	if (event.locals.user) touchLastSeen(event.locals.user);

	const path = event.url.pathname;
	const user = event.locals.user;
	// Signed-out visitors to / see the public home page when the admin turned it on.
	if (!user && path === '/' && publicSettings().publicHomeEnabled && publicSettings().allowPublicPages) {
		redirect(303, '/public');
	}
	if (!user && !isPublic(path)) {
		redirect(303, `/signin${path === '/' ? '' : `?redirectTo=${encodeURIComponent(path + event.url.search)}`}`);
	}
	if (user && !user.setupDone && !path.startsWith('/setup') && !isPublic(path)) {
		redirect(303, '/setup');
	}
	if (user && path === '/signin') redirect(303, '/');

	// Theme: explicit choice sets data-theme; "system" leaves it off so CSS follows the OS.
	const theme = user?.theme ?? event.cookies.get('wl_theme') ?? 'system';
	const attr = theme === 'dark' || theme === 'light' ? `data-theme="${theme}"` : '';
	const res = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%wl.theme%', attr).replace('%wl.themecolor%', themeColorMeta(theme))
	});
	// Signing out forgets this account's cached pages, photos and offline entries on this device.
	if (event.request.method === 'POST' && path === '/settings' && event.url.search === '?/signout') {
		res.headers.set('clear-site-data', '"cache", "storage"');
	}
	return res;
};

/**
 * A page's preloads go in its <head>, not a Link header: that header grows with
 * each page's scripts, and past 4 KB of headers proxies like nginx answer 502
 * Bad Gateway (see $lib/server/preloads).
 */
const smallHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	const link = res.headers.get('link');
	if (!link || event.request.method !== 'GET' || !res.headers.get('content-type')?.startsWith('text/html')) return res;
	const out = preloadsInHead(await res.text(), link);
	const headers = new Headers(res.headers);
	if (out.link) headers.set('link', out.link);
	else headers.delete('link');
	headers.set('content-length', String(Buffer.byteLength(out.html)));
	return new Response(out.html, { status: res.status, statusText: res.statusText, headers });
};

export const handle = sequence(securityHeaders, smallHeaders, csrf, movedPaths, httpCookies, loginLimit, authHandle, appHandle);

/**
 * Something the app didn't expect: logged with a short reference, which the
 * error page shows so the admin can find the entry. The route is logged as its
 * pattern (/unsubscribe/[token]), so tokens in links stay out of the log.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status === 404) return { message };
	const ref = randomBytes(4).toString('hex');
	logger.error('request', `${event.request.method} ${event.route.id ?? event.url.pathname} failed`, {
		error,
		ref,
		status,
		userId: event.locals.user?.id ?? null
	});
	return { message: 'Something went wrong', ref };
};

export const init: ServerInit = () => {
	if (building) return;
	logger.info('server', `Waterline ${VERSION} started`, { node: process.version });
	checkAuthConfig();
	announceSetup();
	failInterruptedExports();
	startScheduler();
};
