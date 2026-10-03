// Unsaved log entries, kept on this device. Leaving a log form by mistake (a
// stray tap, switching category, a reload, the app being closed) doesn't lose
// what was typed: the form shows it again next time, with a way to discard it.
import { tick } from 'svelte';

const PREFIX = 'wl_draft:';
const MAX_AGE = 24 * 3_600_000; // an older draft isn't about the tank today

type Field = [name: string, value: string];
interface Stored {
	at: number;
	fields: Field[];
}

function load(key: string): Stored | null {
	try {
		const s = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null') as Stored | null;
		if (s && Date.now() - s.at < MAX_AGE) return s;
		localStorage.removeItem(PREFIX + key);
	} catch {
		/* storage blocked or unreadable */
	}
	return null;
}

function store(key: string, s: Stored | null) {
	try {
		if (s) localStorage.setItem(PREFIX + key, JSON.stringify(s));
		else localStorage.removeItem(PREFIX + key);
	} catch {
		/* storage blocked or full */
	}
}

export const clearDraft = (key: string) => store(key, null);

/** On sign-out, so a shared device keeps nothing of the last person's. */
export function clearAllDrafts() {
	try {
		for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
	} catch {
		/* storage blocked */
	}
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
// Hidden fields come from the page, except these, which the form sets from its own state.
const KEEP_HIDDEN = new Set(['date', 'time', 'scientificName']);
// Fields the page decides afresh each time, never the draft: "Also mark the reminder … done" is ticked
// by whether the task is due today (or was opened from Mark done), and a draft from before
// it was due would untick it, so the water change gets logged but the reminder stays.
const NOT_DRAFTED = new Set(['completeTask']);

function controls(form: HTMLFormElement) {
	return [...form.elements].filter(
		(el): el is Control =>
			(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) &&
			!!el.name &&
			!NOT_DRAFTED.has(el.name) &&
			!['file', 'submit', 'button', 'reset'].includes(el.type) &&
			(el.type !== 'hidden' || KEEP_HIDDEN.has(el.name))
	);
}

function snapshot(form: HTMLFormElement): Field[] {
	const out: Field[] = [];
	for (const el of controls(form)) {
		if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
			if (el.checked) out.push([el.name, el.value]);
		} else out.push([el.name, el.value]);
	}
	return out;
}

/** The same entries, ignoring empty fields (e.g. one for a parameter just added). */
function same(a: Field[], b: Field[]) {
	const group = (fields: Field[]) => {
		const m = new Map<string, string[]>();
		for (const [n, v] of fields) if (v) m.set(n, [...(m.get(n) ?? []), v]);
		return m;
	};
	const A = group(a);
	const B = group(b);
	if (A.size !== B.size) return false;
	for (const [n, vs] of A) if ((B.get(n) ?? []).sort().join('\n') !== [...vs].sort().join('\n')) return false;
	return true;
}

/** The event a field gets before its value is put back. A field that restores
 * itself (the species picker) calls preventDefault(): no input event follows. */
export type DraftRestoreEvent = CustomEvent<{ value: string; fields: Map<string, string[]> }>;

/**
 * Put saved values back through input and change events, so the form's own
 * state follows. A few passes: a choice (e.g. Removed) can reveal the fields
 * that depend on it, or reset one that was already filled.
 */
async function apply(form: HTMLFormElement, fields: Field[]) {
	const wanted = new Map<string, string[]>();
	for (const [n, v] of fields) wanted.set(n, [...(wanted.get(n) ?? []), v]);
	for (let pass = 0; pass < 4; pass++) {
		let changed = false;
		for (const el of controls(form)) {
			if (el.type === 'hidden') continue; // the form sets these itself
			const want = wanted.get(el.name);
			if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
				if (el.type === 'radio' && !want) continue;
				const on = !!want?.includes(el.value);
				if (el.checked !== on) {
					el.checked = on;
					el.dispatchEvent(new Event('change', { bubbles: true }));
					changed = true;
				}
			} else if (want && el.value !== want[0]) {
				const ev: DraftRestoreEvent = new CustomEvent('draftrestore', { cancelable: true, detail: { value: want[0], fields: wanted } });
				el.value = want[0];
				if (el.dispatchEvent(ev)) {
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
				changed = true;
			}
		}
		await tick();
		if (!changed) break;
	}
}

export interface Restored {
	/** The picked date and time in the draft ('' for "now") */
	date: string;
	time: string;
	/** Put the form back as it was and forget the draft */
	discard: () => Promise<void>;
}

/**
 * `use:logDraft={{ key, onrestore, watch }}` on a new-entry log form. `key` null
 * turns it off (edit forms show the saved entry). `watch`: state that changes
 * fields without an event on the form, such as the date picker.
 */
export function logDraft(
	form: HTMLFormElement,
	opts: { key: string | null; onrestore?: (r: Restored) => void; watch?: unknown }
) {
	const key = opts.key;
	if (!key) return {};
	const pristine = snapshot(form);
	let restoring = true;
	let submitted = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function write() {
		timer = undefined;
		if (restoring || submitted) return;
		const now = snapshot(form);
		store(key!, same(now, pristine) ? null : { at: Date.now(), fields: now });
	}
	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(write, 150);
	}
	function flush() {
		if (timer) {
			clearTimeout(timer);
			write();
		}
	}
	function onInput() {
		submitted = false; // editing again after a save that didn't go through
		schedule();
	}
	function onSubmit() {
		flush(); // the draft stays until the entry is saved (clearDraft)
		submitted = true;
	}
	const onHide = () => document.visibilityState === 'hidden' && flush();

	const saved = load(key);
	if (saved && !same(saved.fields, pristine)) {
		void apply(form, saved.fields).then(() => {
			restoring = false;
			const f = new Map(saved.fields);
			opts.onrestore?.({
				date: f.get('date') ?? '',
				time: f.get('time') ?? '',
				discard: async () => {
					clearDraft(key);
					restoring = true;
					await apply(form, pristine);
					restoring = false;
				}
			});
		});
	} else restoring = false;

	// clicks too: steppers and preset chips change fields without an input event
	const events = ['input', 'change', 'click'] as const;
	for (const t of events) form.addEventListener(t, onInput);
	form.addEventListener('submit', onSubmit);
	addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', onHide);

	return {
		update() {
			schedule(); // a watched value (the picked time) changed
		},
		destroy() {
			if (!submitted) flush();
			clearTimeout(timer);
			for (const t of events) form.removeEventListener(t, onInput);
			form.removeEventListener('submit', onSubmit);
			removeEventListener('pagehide', flush);
			document.removeEventListener('visibilitychange', onHide);
		}
	};
}
