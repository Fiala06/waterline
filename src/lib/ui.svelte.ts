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
