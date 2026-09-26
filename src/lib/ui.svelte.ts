// App-wide UI state shared between the shell and pages (sheets opened from anywhere).
export const ui = $state({
	quickAdd: false,
	tankSwitcher: false,
	online: true,
	/** entries saved on this device, waiting to sync */
	queue: [] as { id: string; title: string; tankId: string | null; error: string | null }[],
	/** a toast raised in the browser (e.g. "Saved on this phone") */
	toast: null as { text: string; id: string | number; undo?: string } | null
});

export function toast(text: string) {
	ui.toast = { text, id: Date.now() };
}
