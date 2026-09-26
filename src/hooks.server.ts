import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { startScheduler } from '$lib/server/scheduler';
import { failInterruptedExports } from '$lib/server/export';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from './auth';
import { getUser } from '$lib/server/users';

const PUBLIC_PATHS = ['/signin', '/auth', '/e', '/unsubscribe'];

/**
 * Cross-site form posts are refused (the check SvelteKit normally does),
 * except one-click unsubscribe, which mail providers POST without an Origin.
 */
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const csrf: Handle = ({ event, resolve }) => {
	const { request, url } = event;
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
		const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
		const origin = request.headers.get('origin');
		if (FORM_TYPES.includes(type) && origin !== url.origin && !url.pathname.startsWith('/unsubscribe/')) {
			return new Response(`Cross-site ${request.method} form submissions are forbidden`, { status: 403 });
		}
	}
	return resolve(event);
};
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

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
	event.locals.user = uid ? (getUser(uid) ?? null) : null;

	const path = event.url.pathname;
	const user = event.locals.user;
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
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%wl.theme%', attr)
	});
};

export const handle = sequence(csrf, authHandle, appHandle);

export const init: ServerInit = () => {
	if (building) return;
	failInterruptedExports();
	startScheduler();
};
