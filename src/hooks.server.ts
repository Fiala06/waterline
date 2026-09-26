import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from './auth';
import { getUser } from '$lib/server/users';

const PUBLIC_PATHS = ['/signin', '/auth'];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

const appHandle: Handle = async ({ event, resolve }) => {
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

export const handle = sequence(authHandle, appHandle);
