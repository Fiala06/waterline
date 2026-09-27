import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { startScheduler } from '$lib/server/scheduler';
import { failInterruptedExports } from '$lib/server/export';
import { sequence } from '@sveltejs/kit/hooks';
import { checkAuthConfig, devLoginEnabled, handle as authHandle } from './auth';
import { clearLoginFailures, loginBlockedMinutes, recordLoginFailure } from '$lib/server/rate-limit';
import { getUser, isEmailAllowed } from '$lib/server/users';
import { publicSettings } from '$lib/server/public';

const PUBLIC_PATHS = ['/signin', '/auth', '/e', '/unsubscribe', '/t', '/s', '/p', '/public', '/sitemap.xml', '/robots.txt'];

/**
 * Only this site may post to it (the check SvelteKit normally does, for every
 * content type). Exceptions: one-click unsubscribe, which mail providers POST
 * without an Origin, and the test-only /dev endpoints (404 unless AUTH_DEV_LOGIN).
 */
const csrf: Handle = ({ event, resolve }) => {
	const { request, url } = event;
	if (
		!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
		request.headers.get('origin') !== url.origin &&
		!url.pathname.startsWith('/unsubscribe/') &&
		!url.pathname.startsWith('/dev/')
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
	if (url.protocol === 'https:') set('strict-transport-security', 'max-age=31536000');
	return res;
};

/** Browser bar color: the page background of the chosen theme, or both for "system". */
function themeColorMeta(theme: string) {
	const dark = '<meta name="theme-color" content="#0c1a1f" />';
	const light = '<meta name="theme-color" content="#f4f7f6" />';
	if (theme === 'dark') return dark;
	if (theme === 'light') return light;
	return `${dark.replace(' />', ' media="(prefers-color-scheme: dark)" />')}${light.replace(' />', ' media="(prefers-color-scheme: light)" />')}`;
}

const isPublic = (path: string) => path === '/dev/seed' || path === '/dev/next-release' || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

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
	const found = uid ? (getUser(uid) ?? null) : null;
	// Someone taken off ALLOWED_EMAILS is signed out on their next request.
	event.locals.user = found && (devLoginEnabled() || isEmailAllowed(found.email)) ? found : null;

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

export const handle = sequence(securityHeaders, csrf, movedPaths, httpCookies, loginLimit, authHandle, appHandle);

export const init: ServerInit = () => {
	if (building) return;
	checkAuthConfig();
	failInterruptedExports();
	startScheduler();
};
