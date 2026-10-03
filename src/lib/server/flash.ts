import type { Cookies } from '@sveltejs/kit';

// One-shot toast carried across a redirect ("✓ Saved 7 readings · 1 out of range"),
// optionally with an Undo (a task completion, an import) or a View link to the new entry.
const NAME = 'wl_flash';

export interface Flash {
	text: string;
	/** Undo posts `name=value` to `action` */
	undo?: FlashUndo;
	view?: string; // same-site path, e.g. /entries/test/<id>
}
export interface FlashUndo {
	action: string;
	name: string;
	value: string;
}

/** The actions an Undo can post to. */
const UNDO_ACTIONS = [/^\/tasks\?\/undo$/, /^\/tanks\/[\w-]+\/import\/[a-z-]+\?\/undo$/, /^\/photos\/[\w-]+\?\/uncover$/, /^\/tanks\/[\w-]+\/sharing\?\/restore$/];

function validUndo(u: unknown): FlashUndo | undefined {
	if (!u || typeof u !== 'object') return undefined;
	const { action, name, value } = u as Record<string, unknown>;
	if (typeof action !== 'string' || !UNDO_ACTIONS.some((r) => r.test(action))) return undefined;
	// the value may be empty: "the tank had no cover before"
	if (typeof name !== 'string' || !/^[a-zA-Z]+$/.test(name) || typeof value !== 'string' || value.length > 100) return undefined;
	return { action, name, value };
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
			undo: validUndo(f.undo),
			view: typeof f.view === 'string' && f.view.startsWith('/entries/') ? f.view : undefined
		};
	} catch {
		return null;
	}
}
