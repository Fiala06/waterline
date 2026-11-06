import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { digestAuthorization, parseDigestChallenge } from '$lib/server/plugs';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): a Shelly Plug US Gen4's RPC API as
// Waterline uses it (#203, #205), for the end-to-end tests. Each plug is
// /dev/shelly/<name>: POST /rpc with {id, method, params}, as Waterline calls
// it, or GET /rpc/<Method>?<params> for a test to press its button. On at
// first and drawing 3.1 W; it calls its webhooks when it switches, and
// toggle_after switches it back after so many seconds. One named locked-…
// asks for the password plug-pass (digest, SHA-256, user admin); one named
// doser-… starts off, with a schedule at 10:30 and an auto-off of 30 s, as a
// doser's plug set up in the Shelly app is.
interface Plug {
	on: boolean;
	hooks: { id: number; cid: number; enable: boolean; event: string; name: string; urls: string[] }[];
	jobs: { id: number; enable: boolean; timespec: string; calls: { method: string; params: Record<string, unknown> }[] }[];
	autoOff: number | null;
	timer?: ReturnType<typeof setTimeout>;
	nextHook: number;
}
const g = globalThis as { __devShelly?: Map<string, Plug> };
const plugs = (g.__devShelly ??= new Map());
const PASSWORD = 'plug-pass';
const NONCE = 'dev-nonce';

function plugNamed(name: string): Plug {
	let p = plugs.get(name);
	if (!p) {
		const doser = name.startsWith('doser-');
		p = {
			on: !doser,
			hooks: [],
			jobs: doser ? [{ id: 1, enable: true, timespec: '0 30 10 * * *', calls: [{ method: 'Switch.Set', params: { id: 0, on: true } }] }] : [],
			autoOff: doser ? 30 : null,
			nextHook: 1
		};
		plugs.set(name, p);
	}
	return p;
}

/** Switch it, calling its webhooks when that's a change, as a plug does. */
function setOn(p: Plug, on: boolean, toggleAfter?: number) {
	clearTimeout(p.timer);
	const was = p.on;
	p.on = on;
	if (was !== on) for (const h of p.hooks.filter((h) => h.enable && h.event === `switch.${on ? 'on' : 'off'}`)) for (const u of h.urls) fetch(u).catch(() => {});
	const back = toggleAfter ?? (on ? p.autoOff : null);
	if (back) p.timer = setTimeout(() => setOn(p, !on), back * 1000);
	return was;
}

function call(p: Plug, realm: string, method: string, params: Record<string, unknown>) {
	switch (method) {
		case 'Shelly.GetDeviceInfo':
			return { name: null, id: realm, model: 'S4PL-00116US', gen: 4, app: 'PlugUSG4', ver: '1.5.0' };
		case 'Switch.GetStatus':
			return { id: 0, source: 'init', output: p.on, apower: p.on ? 3.1 : 0, voltage: 120.4, current: p.on ? 0.03 : 0 };
		case 'Switch.GetConfig':
			return { id: 0, name: null, auto_off: !!p.autoOff, auto_off_delay: p.autoOff ?? 60 };
		case 'Switch.Set': {
			const on = params.on === true || params.on === 'true';
			const after = Number(params.toggle_after);
			return { was_on: setOn(p, on, Number.isFinite(after) && after > 0 ? after : undefined) };
		}
		case 'Webhook.List':
			return { hooks: p.hooks, rev: 1 };
		case 'Webhook.Create': {
			const id = p.nextHook++;
			p.hooks.push({ id, cid: Number(params.cid ?? 0), enable: params.enable !== false, event: String(params.event), name: String(params.name ?? ''), urls: (params.urls as string[]) ?? [] });
			return { id, rev: 1 };
		}
		case 'Webhook.Delete':
			p.hooks = p.hooks.filter((h) => h.id !== Number(params.id));
			return { rev: 1 };
		case 'Schedule.List':
			return { jobs: p.jobs, rev: 1 };
		case 'Schedule.Update': {
			const j = p.jobs.find((x) => x.id === Number(params.id));
			if (!j) return null;
			if (typeof params.enable === 'boolean') j.enable = params.enable;
			return { rev: 1 };
		}
		default:
			return null;
	}
}

function signedIn(name: string, realm: string, request: Request, url: URL): Response | null {
	if (!name.startsWith('locked-')) return null;
	const auth = request.headers.get('authorization');
	const c = auth ? parseDigestChallenge(auth) : null;
	const want = c && digestAuthorization({ realm, nonce: NONCE }, { username: 'admin', password: PASSWORD, method: request.method, uri: c.uri ?? url.pathname, cnonce: c.cnonce, nc: c.nc });
	if (auth && auth === want && c?.uri === url.pathname + url.search) return null;
	return json({ code: 401, message: 'unauthorized' }, { status: 401, headers: { 'www-authenticate': `Digest qop="auth", realm="${realm}", nonce="${NONCE}", algorithm=SHA-256` } });
}

/** A test presses the button, or asks: GET /dev/shelly/<name>/rpc/<Method>?<params> */
export const GET: RequestHandler = ({ params, url, request }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const m = /^([a-z0-9-]+)\/rpc\/([A-Za-z.]+)$/.exec(params.path);
	if (!m) error(404, 'Not found');
	const realm = `shellyplugusg4-${m[1]}`;
	const denied = signedIn(m[1], realm, request, url);
	if (denied) return denied;
	const result = call(plugNamed(m[1]), realm, m[2], Object.fromEntries(url.searchParams));
	if (!result) error(404, 'Not found');
	return json(result);
};

/** Waterline's calls: POST /dev/shelly/<name>/rpc with {id, method, params} */
export const POST: RequestHandler = async ({ params, url, request }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const m = /^([a-z0-9-]+)\/rpc$/.exec(params.path);
	if (!m) error(404, 'Not found');
	const realm = `shellyplugusg4-${m[1]}`;
	const denied = signedIn(m[1], realm, request, url);
	if (denied) return denied;
	const body = (await request.json().catch(() => ({}))) as { id?: number; method?: string; params?: Record<string, unknown> };
	const result = call(plugNamed(m[1]), realm, String(body.method), body.params ?? {});
	if (!result) return json({ id: body.id ?? 1, src: realm, error: { code: -114, message: `Method ${body.method} failed: not found` } }, { status: 404 });
	return json({ id: body.id ?? 1, src: realm, result });
};
