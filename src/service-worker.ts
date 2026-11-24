/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Offline support: the app shell is precached; pages and their data are
// network-first with the last copy as a fallback, so the dashboard still opens
// at the tank with no signal. New entries made offline are queued in the page
// (see $lib/offline.ts), not here.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const SHELL = `shell-${version}`;
// pages and their data belong to the version that drew them (#114): an update
// never answers with the last version's HTML or __data.json
const PAGES = `pages-${version}`;
const MEDIA = 'media-v1';
// How much is kept (#241): the caches are trimmed to their newest entries, so they
// stop growing and the browser has less reason to clear this site's storage, which
// would take entries logged offline with it.
const MEDIA_MAX = 400;
const PAGES_MAX = 150;
// whose pages and photos are kept (#108)
const OWNER = 'owner-v1';
// the install screenshots are for the browser's install sheet, not for offline use;
// the barcode reader's WebAssembly (1 MB, #147) is fetched when the scanner page needs it
const ASSETS = [...build.filter((f) => !f.endsWith('.wasm')), ...files.filter((f) => !f.startsWith('/screenshots/'))];

// Never cache: sign-in, email links, downloads, test hooks.
const NO_CACHE = [
	/^\/auth\//,
	/^\/signin/,
	/^\/e\//,
	/^\/unsubscribe\//,
	/^\/settings\/export\//,
	/^\/dev\//,
	/^\/(mcp|api\/v1)(\/|$)/, // an AI assistant's reads (#9)
	/^\/cal\//, // calendar feeds, for calendar apps
	// public pages are for visitors; always fresh
	/^\/t\//,
	/^\/s\//,
	/^\/p\//,
	/^\/public/,
	/^\/sitemap\.xml/,
	/^\/robots\.txt/,
	// signed-out and one-off pages (#345): the homepage, invitations, first start, an app's sign-in
	/^\/(welcome|about|invite|share|first-run|setup|oauth|plug-hook)(\/|$)/,
	/^\/\.well-known\//
];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			// the last version's shell and pages go (pages-v1 included, from before #114); photos stay
			.then((keys) => Promise.all(keys.filter((k) => (k.startsWith('shell-') && k !== SHELL) || (k.startsWith('pages-') && k !== PAGES)).map((k) => caches.delete(k))))
			// full-size photos kept by earlier versions go (#241), and the thumbnails are brought within the limit
			.then(() => dropFullSize())
			.then(() => sw.clients.claim())
	);
});

/** Forget everything kept for the signed-in person: their pages, photos, and whose they were. */
const clearUserCaches = () =>
	caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pages-') || k === MEDIA || k === OWNER).map((k) => caches.delete(k))));

// Whose pages these are (#108): the app says who's signed in on each load, and
// if it's someone else, the last person's pages and photos go before any are shown.
async function setOwner(id: string) {
	const cache = await caches.open(OWNER);
	const was = await (await cache.match('/owner'))?.text();
	if (was === id) return;
	if (was !== undefined) await clearUserCaches();
	await (await caches.open(OWNER)).put('/owner', new Response(id));
}

sw.addEventListener('message', (event) => {
	// sign-out, or Remove offline data in Settings
	if (event.data === 'clear-user-cache') event.waitUntil(clearUserCaches());
	else if (event.data?.type === 'user' && typeof event.data.id === 'string') event.waitUntil(setOwner(event.data.id));
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return;
	if (NO_CACHE.some((r) => r.test(url.pathname))) return;

	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
		return;
	}

	if (url.pathname.startsWith('/media/')) {
		// thumbnails are kept here, for the dashboard and lists offline; a full-size photo is left to the
		// browser's own cache (it's served immutable for a year), so viewing photos doesn't fill the device (#241)
		if (isThumb(url)) event.respondWith(cacheFirst(event, MEDIA, MEDIA_MAX));
		return;
	}

	const isPage = req.mode === 'navigate' || url.pathname.endsWith('/__data.json');
	if (isPage) event.respondWith(networkFirst(event));
});

const isThumb = (url: URL) => url.searchParams.get('size') === 'thumb';

/** Keep a cache to its newest `max` entries: keys() lists them oldest first. */
async function trim(cache: Cache, max: number) {
	const keys = await cache.keys();
	await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** Store, then trim. An entry stored again moves to the newest end. */
async function keep(cache: Cache, req: Request, res: Response, max: number) {
	try {
		await cache.delete(req);
		await cache.put(req, res);
		await trim(cache, max);
	} catch {
		/* out of room, or the response can't be stored: nothing kept */
	}
}

async function dropFullSize() {
	if (!(await caches.has(MEDIA))) return;
	const cache = await caches.open(MEDIA);
	const keys = await cache.keys();
	await Promise.all(keys.filter((k) => !isThumb(new URL(k.url))).map((k) => cache.delete(k)));
	await trim(cache, MEDIA_MAX);
}

async function cacheFirst(event: FetchEvent, name: string, max: number) {
	const req = event.request;
	const cache = await caches.open(name);
	const hit = await cache.match(req);
	if (hit) return hit;
	const res = await fetch(req);
	// kept before the worker may stop (#336)
	if (res.ok) event.waitUntil(keep(cache, req, res.clone(), max));
	return res;
}

// With a copy kept, how long the network gets before the copy is shown (#336): with
// Wi-Fi up but no way out, a fetch can hang for tens of seconds before it fails.
const NETWORK_WAIT_MS = 4000;
// where a signed-out visit is sent: the pages kept for the last person go
const SIGNED_OUT = /^\/(signin|welcome|public)(\/|\?|$)/;

/**
 * A page's data that is a redirect, not data (SvelteKit sends one as a 200 JSON
 * `{type: 'redirect'}`): never kept, and signed out clears what's kept (#336).
 */
async function dataRedirect(res: Response): Promise<string | null> {
	if (!res.headers.get('content-type')?.includes('application/json')) return null;
	try {
		const body = (await res.clone().json()) as { type?: string; location?: string };
		return body?.type === 'redirect' ? (body.location ?? '') : null;
	} catch {
		return null;
	}
}

async function networkFirst(event: FetchEvent) {
	const req = event.request;
	const cache = await caches.open(PAGES);
	const hit = await cache.match(req, { ignoreVary: true });
	const fresh = (async () => {
		const res = await fetch(req);
		const isData = new URL(req.url).pathname.endsWith('/__data.json');
		const redirect = isData && res.ok ? await dataRedirect(res) : null;
		// Signed out, or the session was revoked (#108): what's kept for them goes on the first contact.
		// A navigation's own redirect can't be read here (it's opaque); the sign-in page, the
		// homepage and the public home tell the worker instead.
		if (redirect != null) {
			if (SIGNED_OUT.test(new URL(redirect, req.url).pathname)) await clearUserCaches();
		}
		// Only keep real pages and data, not redirects or errors.
		else if (res.ok && res.type === 'basic') event.waitUntil(keep(cache, req, res.clone(), PAGES_MAX));
		return res;
	})();
	// the copy it falls back on
	const fallback = async () => {
		if (hit) return hit;
		if (req.mode === 'navigate') {
			const home = await cache.match('/', { ignoreSearch: true });
			if (home) return home;
		}
		return new Response(offlinePage, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
	};
	if (!hit) return fresh.catch(fallback);
	// a copy is kept: the network has a few seconds, then the copy shows (the fetch carries on and keeps what it gets)
	event.waitUntil(fresh.then(() => undefined, () => undefined));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((resolve) => (timer = setTimeout(() => resolve('late'), NETWORK_WAIT_MS)));
	try {
		const res = await Promise.race([fresh, late]);
		return res === 'late' ? hit : res;
	} catch {
		return hit;
	} finally {
		clearTimeout(timer);
	}
}

// Push notifications (#16): reminders and alerts from the server, with Mark
// done and Snooze. Those post the notice's one-time link, like the buttons on
// the email's page; if that doesn't work (done already, offline), the page
// opens to say why.
interface Pushed {
	title: string;
	body: string;
	url: string;
	tag: string;
	actions?: { action: string; title: string; url: string; result: string }[];
}

sw.addEventListener('push', (event) => {
	let n: Pushed;
	try {
		n = event.data!.json() as Pushed;
	} catch {
		return;
	}
	event.waitUntil(
		sw.registration.showNotification(n.title, {
			body: n.body,
			tag: n.tag,
			icon: '/icons/icon-192.png',
			data: n,
			// @ts-expect-error: not in TypeScript's lib yet
			actions: (n.actions ?? []).map((a) => ({ action: a.action, title: a.title }))
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	const n = event.notification.data as Pushed | undefined;
	event.notification.close();
	if (!n) return;
	const act = n.actions?.find((a) => a.action === event.action);
	// Open (#180) opens its page; Mark done and Snooze post their link
	event.waitUntil(act && act.action !== 'open' ? runAction(n, act) : openPage(act?.url ?? n.url));
});

async function runAction(n: Pushed, act: NonNullable<Pushed['actions']>[number]) {
	try {
		const res = await fetch(act.url, { method: 'POST', body: new URLSearchParams(), headers: { accept: 'text/html' } });
		if (!res.ok) throw new Error(String(res.status));
		await sw.registration.showNotification(act.result, { tag: n.tag, icon: '/icons/icon-192.png', data: { ...n, actions: [] } });
	} catch {
		await openPage(act.url);
	}
}

async function openPage(url: string) {
	const open = (await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })) as WindowClient[];
	const same = open.find((c) => new URL(c.url).origin === sw.location.origin);
	if (same) {
		await same.focus();
		await same.navigate(url).catch(() => sw.clients.openWindow(url));
	} else await sw.clients.openWindow(url);
}

// The browser renewed this device's subscription: tell the server the new one.
sw.addEventListener('pushsubscriptionchange', (event: Event) => {
	const e = event as Event & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null; waitUntil(p: Promise<unknown>): void };
	e.waitUntil(
		(async () => {
			const next =
				e.newSubscription ??
				(await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: e.oldSubscription?.options.applicationServerKey }));
			await fetch('/push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...next.toJSON(), replaces: e.oldSubscription?.endpoint ?? null })
			});
		})().catch(() => {})
	);
});

// Standalone (no app.css here), so it carries the bg/text/muted/accent tokens for both themes.
const offlinePage = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>Offline · Waterline</title>
<style>
:root{--bg:#0c1a1f;--text:#e6f0f0;--text-muted:#9fb4b8;--accent:#4fc4bd;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f4f7f6;--text:#0f2126;--text-muted:#4f666b;--accent:#197474;color-scheme:light}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:var(--bg);color:var(--text);font-family:Archivo,system-ui,sans-serif;text-align:center}
body>div{max-width:360px}
h1{margin:0 0 8px;font-size:22px;font-weight:800}
p{margin:0;color:var(--text-muted);line-height:1.5;text-wrap:pretty}
a{display:inline-flex;align-items:center;min-height:44px;margin-top:8px;color:var(--accent);font-weight:600;text-decoration:none}
</style>
<body><div><h1>You're offline</h1>
<p>This page hasn't been opened on this device yet.<br>Open the dashboard once while online and it will work offline too.</p>
<a href="/">Try the dashboard</a></div></body>`;
