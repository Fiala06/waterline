// App-wide UI state shared between the shell and pages (sheets opened from anywhere).

/** A toast's Undo: posts `name=value` to `action` (a task completion, an import). */
export interface ToastUndo {
	action: string;
	name: string;
	value: string;
}

export const ui = $state({
	quickAdd: false,
	tankSwitcher: false,
	/** the desktop tank dropdown (G12): in the header, or the dashboard's hero */
	tankMenu: false,
	/** ⌘K: tanks, tabs and actions */
	palette: false,
	/** the ? sheet */
	keys: false,
	/** the alerts panel, from the bell */
	alerts: false,
	/** desktop sidebar: kept open, or a rail that expands on hover; null until the user chooses */
	navPinned: null as boolean | null,
	online: true,
	/** the list page the user came from (History, Charts…), for entry Back links and deletes */
	prev: null as string | null,
	/** signed-in user, so one account never sees or sends another's offline entries */
	userId: null as string | null,
	/** entries saved on this device, waiting to sync */
	queue: [] as { id: string; title: string; tankId: string | null; error: string | null }[],
	/** a toast raised in the browser (e.g. "Saved on this phone") */
	toast: null as { text: string; id: string | number; undo?: ToastUndo; view?: string } | null
});

export function toast(text: string) {
	ui.toast = { text, id: Date.now() };
}

/** Keyboard shortcuts are ignored while typing in a field or inside a dialog. */
export function typing(e: KeyboardEvent) {
	const t = e.target as HTMLElement | null;
	return !!t?.closest('input, textarea, select, [contenteditable="true"], dialog');
}

/** The page's main log forms for a tank: T test, W water change, D dose, N note. */
export function logHref(kind: 'test' | 'water_change' | 'dosing' | 'note' | 'maintenance', tankId: string | null) {
	const q = tankId ? `?tank=${tankId}` : '';
	if (kind === 'test') return `/entries/test/new${q}`;
	return `/entries/event/new${q}${q ? '&' : '?'}category=${kind}`;
}
