import type { Cookies } from '@sveltejs/kit';

// One-shot toast carried across a redirect ("✓ Saved 7 readings · 1 out of range"),
// optionally with an Undo for a task completion or a View link to the new entry.
const NAME = 'wl_flash';

export interface Flash {
	text: string;
	undo?: string; // task completion id
	view?: string; // same-site path, e.g. /entries/test/<id>
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
		if (typeof f?.text !== 'string') return null;
		return {
			text: f.text,
			undo: typeof f.undo === 'string' ? f.undo : undefined,
			view: typeof f.view === 'string' && f.view.startsWith('/entries/') ? f.view : undefined
		};
	} catch {
		return null;
	}
}
