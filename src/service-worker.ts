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
// whose pages and photos are kept (#108)
const OWNER = 'owner-v1';
// the install screenshots are for the browser's install sheet, not for offline use
const ASSETS = [...build, ...files.filter((f) => !f.startsWith('/screenshots/'))];

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
	/^\/robots\.txt/
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
		event.respondWith(cacheFirst(req, MEDIA));
		return;
	}

	const isPage = req.mode === 'navigate' || url.pathname.endsWith('/__data.json');
	if (isPage) event.respondWith(networkFirst(req));
});

async function cacheFirst(req: Request, name: string) {
	const cache = await caches.open(name);
	const hit = await cache.match(req);
	if (hit) return hit;
	const res = await fetch(req);
	if (res.ok) cache.put(req, res.clone());
	return res;
}

async function networkFirst(req: Request) {
	const cache = await caches.open(PAGES);
	try {
		const res = await fetch(req);
		// Signed out, or the session was revoked (#108): what's kept for them goes on the first contact
		if (res.redirected && new URL(res.url).pathname.startsWith('/signin')) await clearUserCaches();
		// Only keep real pages, not redirects to sign-in or errors.
		else if (res.ok && !res.redirected && res.type === 'basic') cache.put(req, res.clone());
		return res;
	} catch {
		const hit = await cache.match(req, { ignoreVary: true });
		if (hit) return hit;
		if (req.mode === 'navigate') {
			const home = await cache.match('/', { ignoreSearch: true });
			if (home) return home;
		}
		return new Response(offlinePage, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
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
	event.waitUntil(act ? runAction(n, act) : openPage(n.url));
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
