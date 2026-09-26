import type { Cookies } from '@sveltejs/kit';

// One-shot toast message carried across a redirect ("✓ Saved 7 readings · 1 out of range").
const NAME = 'wl_flash';

export function setFlash(cookies: Cookies, message: string) {
	cookies.set(NAME, encodeURIComponent(message), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 });
}

export function takeFlash(cookies: Cookies): string | null {
	const v = cookies.get(NAME);
	if (!v) return null;
	cookies.delete(NAME, { path: '/' });
	return decodeURIComponent(v);
}
