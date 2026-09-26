import type { Cookies } from '@sveltejs/kit';

// One-shot toast carried across a redirect ("✓ Saved 7 readings · 1 out of range"),
// optionally with an Undo for a task completion.
const NAME = 'wl_flash';

export interface Flash {
	text: string;
	undo?: string; // task completion id
}

export function setFlash(cookies: Cookies, text: string, extra: Omit<Flash, 'text'> = {}) {
	cookies.set(NAME, encodeURIComponent(JSON.stringify({ text, ...extra })), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60
	});
}

export function takeFlash(cookies: Cookies): Flash | null {
	const v = cookies.get(NAME);
	if (!v) return null;
	cookies.delete(NAME, { path: '/' });
	try {
		const f = JSON.parse(decodeURIComponent(v));
		return typeof f?.text === 'string' ? { text: f.text, undo: typeof f.undo === 'string' ? f.undo : undefined } : null;
	} catch {
		return null;
	}
}
