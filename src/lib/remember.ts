// The current tank and History's range are remembered in cookies. They are
// written on a real visit only (#223): the server writes them when a page is
// asked for outright, and the app writes them here after moving to a page
// itself. A link's data fetched ahead on hover reads them and never writes
// them, so passing the mouse over another tank doesn't make it the current one.
export const TANK_COOKIE = 'wl_tank';
export const RANGE_COOKIE = 'wl_history_range';
const YEAR = 60 * 60 * 24 * 365;

/** For the server: readable by the app, so it can keep them in step as it navigates. */
export const rememberOptions = { path: '/', httpOnly: false, sameSite: 'lax', maxAge: YEAR } as const;

/** In the browser: keep a choice for next time. */
export function remember(name: string, value: string) {
	try {
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
	} catch {
		/* cookies blocked */
	}
}
