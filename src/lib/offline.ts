// Offline queue for new log entries (G11). When there's no connection, the
// form's fields (and photos) are stored in IndexedDB and posted later. Each
// entry carries a clientId, so the server ignores a replay it already has.
import type { SubmitFunction } from '@sveltejs/kit';
import { toast, ui } from './ui.svelte';
import { clearAllDrafts } from './draft';
import { utcToZoned } from './time';

const DB = 'waterline';
const STORE = 'queue';

type Field = [string, string | { name: string; type: string; blob: Blob }];
export interface Queued {
	id: string;
	url: string; // the form action, e.g. /entries/test/new?tank=…
	fields: Field[];
	title: string; // "Water test · 5 readings"
	tankId: string | null;
	userId: string | null;
	createdAt: string;
	error?: string;
}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const r = fn(db.transaction(STORE, mode).objectStore(STORE));
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

export async function listQueued(): Promise<Queued[]> {
	try {
		const all = await tx<Queued[]>('readonly', (s) => s.getAll() as IDBRequest<Queued[]>);
		return all.filter((q) => q.userId === ui.userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	} catch {
		return [];
	}
}

export async function refreshQueue() {
	ui.queue = (await listQueued()).map((q) => ({ id: q.id, title: q.title, tankId: q.tankId, error: q.error ?? null }));
}

/**
 * Queue a form submission. Empty date/time fields are filled with now in the
 * user's time zone, so the entry keeps the time it was logged, not synced.
 */
export async function enqueue(form: FormData, url: string, title: string, timeZone: string) {
	if (!form.get('date') || !form.get('time')) {
		const now = utcToZoned(new Date(), timeZone);
		form.set('date', now.date);
		form.set('time', now.time);
	}
	if (!form.get('clientId')) form.set('clientId', crypto.randomUUID());
	const fields: Field[] = [];
	for (const [k, v] of form) {
		if (typeof v === 'string') fields.push([k, v]);
		else if (v.size) fields.push([k, { name: v.name, type: v.type, blob: v }]);
	}
	const item: Queued = {
		id: String(form.get('clientId')),
		url,
		fields,
		title,
		tankId: new URL(url, location.origin).searchParams.get('tank'),
		userId: ui.userId,
		createdAt: new Date().toISOString()
	};
	await tx('readwrite', (s) => s.put(item));
	await refreshQueue();
}

export async function discard(id: string) {
	await tx('readwrite', (s) => s.delete(id));
	await refreshQueue();
}

/** Clear a refused entry's error and try to send it again. */
export async function retry(id: string) {
	const item = await tx<Queued | undefined>('readonly', (s) => s.get(id) as IDBRequest<Queued | undefined>);
	if (item) await tx('readwrite', (s) => s.put({ ...item, error: undefined }));
	return flushQueue();
}

/**
 * use:enhance for the log forms. With `offline` (new entries), no connection
 * keeps the entry on this device (G11) and goes back to `closeHref`, which the
 * service worker can answer from its cache. Otherwise it submits as usual.
 */
export function queueable(o: {
	offline: boolean;
	title: () => string;
	closeHref: () => string;
	timeZone: string;
	busy: (b: boolean) => void;
	/** The entry was saved, on the server or on this device (e.g. to forget its draft) */
	onsaved?: () => void;
}): SubmitFunction {
	return ({ formData, action, cancel }) => {
		const queue = async () => {
			try {
				await enqueue(formData, action.pathname + action.search, o.title(), o.timeZone);
			} catch {
				toast("✕ Couldn't save on this device. Try again when you're back online.");
				o.busy(false);
				return;
			}
			o.onsaved?.();
			try {
				sessionStorage.setItem('wl_toast', "You're offline. Saved, and it'll sync when you're back on dry land.");
			} catch {
				/* storage blocked */
			}
			location.assign(o.closeHref());
		};
		if (o.offline && !navigator.onLine) {
			cancel();
			void queue();
			return;
		}
		o.busy(true);
		return async ({ result, update }) => {
			if (o.offline && result.type === 'error' && !navigator.onLine) await queue();
			else {
				if (result.type === 'redirect' || result.type === 'success') o.onsaved?.();
				await update({ reset: false });
				o.busy(false);
			}
		};
	};
}

let flushing = false;

/**
 * Entries queued before the log forms moved from /log/… still post: ad
 * blockers' privacy lists block /log/event?…, so they aren't left to the
 * server's redirect.
 */
export const currentUrl = (url: string) => url.replace(/^\/log\/(test|event)(?=[?#]|$)/, '/entries/$1/new');

/** Post queued entries in order. Stops at the first network failure. */
export async function flushQueue(): Promise<number> {
	if (flushing || !navigator.onLine) return 0;
	flushing = true;
	let synced = 0;
	try {
		for (const item of await listQueued()) {
			if (item.error) continue; // refused before: waits for Retry or Discard
			const body = new FormData();
			for (const [k, v] of item.fields) {
				if (typeof v === 'string') body.append(k, v);
				else body.append(k, new File([v.blob], v.name, { type: v.type }));
			}
			let res: Response;
			try {
				res = await fetch(currentUrl(item.url), {
					method: 'POST',
					body,
					// whose entry it is: the server saves it only for them (#108)
					headers: { 'x-sveltekit-action': 'true', accept: 'application/json', 'x-waterline-sync': '1', ...(item.userId ? { 'x-waterline-user': item.userId } : {}) }
				});
			} catch {
				break; // still offline
			}
			const result = await res.json().catch(() => null);
			if (result?.type === 'redirect' || result?.type === 'success') {
				await tx('readwrite', (s) => s.delete(item.id));
				synced++;
			} else {
				// The server refused it (e.g. the tank was deleted); keep it so the user can see and discard it.
				const message =
					res.status === 409
						? 'Logged by another account. Sign in as them to sync it.'
						: result?.data
							? "The server couldn't save this entry."
							: `Sync failed (${res.status}).`;
				await tx('readwrite', (s) => s.put({ ...item, error: message }));
			}
		}
	} finally {
		flushing = false;
		await refreshQueue();
	}
	return synced;
}

/** How many entries on this device are still waiting to sync, for anyone. */
export async function queuedOnDevice(): Promise<number> {
	try {
		return (await tx<number>('readonly', (s) => s.count())) ?? 0;
	} catch {
		return 0;
	}
}

/**
 * Forget this device (#108): the pages and photos kept for offline use, the
 * entries waiting to sync (everyone's) and unsaved drafts. Nothing on the server changes.
 */
export async function forgetDevice() {
	try {
		await tx('readwrite', (s) => s.clear());
	} catch {
		// no queue yet
	}
	clearAllDrafts();
	navigator.serviceWorker?.controller?.postMessage('clear-user-cache');
	if ('caches' in window) {
		const keys = await caches.keys();
		await Promise.all(keys.filter((k) => k.startsWith('pages-') || k.startsWith('media-')).map((k) => caches.delete(k)));
	}
	await refreshQueue();
}
