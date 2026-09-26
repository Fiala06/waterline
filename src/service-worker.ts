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
const PAGES = 'pages-v1';
const MEDIA = 'media-v1';
const ASSETS = [...build, ...files];

// Never cache: sign-in, email links, downloads, test hooks.
const NO_CACHE = [/^\/auth\//, /^\/signin/, /^\/e\//, /^\/unsubscribe\//, /^\/settings\/export\//, /^\/dev\//];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

// The page asks us to forget cached pages on sign-out.
sw.addEventListener('message', (event) => {
	if (event.data === 'clear-user-cache') {
		event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(MEDIA)]));
	}
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
		// Only keep real pages, not redirects to sign-in or errors.
		if (res.ok && !res.redirected && res.type === 'basic') cache.put(req, res.clone());
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

const offlinePage = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Waterline</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c1a1f;color:#e6f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:22px;font-weight:600;margin-bottom:8px">You're offline</div>
<div style="color:#9fb4b8;line-height:1.5">This page hasn't been opened on this device yet.<br>Open the dashboard once while online and it will work offline too.</div>
<p><a href="/" style="color:#4fc4bd;font-weight:600">Try the dashboard</a></p></div></body>`;
