import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { digestAuthorization, parseDigestChallenge } from '$lib/server/plugs';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): a Shelly Plug US Gen4's RPC API as
// Waterline reads and switches it (#203), for the end-to-end tests. Each plug
// is /dev/shelly/<name>, on at first and drawing 3.1 W; one named locked-…
// asks for the password plug-pass (digest, SHA-256, user admin), as a plug
// with a password set in the Shelly app does.
const g = globalThis as { __devPlugs?: Map<string, boolean> };
const plugs = (g.__devPlugs ??= new Map());
const PASSWORD = 'plug-pass';
const NONCE = 'dev-nonce';

export const GET: RequestHandler = ({ params, url, request }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const m = /^([a-z0-9-]+)\/rpc\/([A-Za-z.]+)$/.exec(params.path);
	if (!m) error(404, 'Not found');
	const [, name, method] = m;
	const realm = `shellyplugusg4-${name}`;
	if (name.startsWith('locked-')) {
		const auth = request.headers.get('authorization');
		const c = auth ? parseDigestChallenge(auth) : null;
		const want = c && digestAuthorization({ realm, nonce: NONCE }, { username: 'admin', password: PASSWORD, method: 'GET', uri: url.pathname + url.search, cnonce: c.cnonce, nc: c.nc });
		if (!auth || auth !== want)
			return json({ code: 401, message: 'unauthorized' }, { status: 401, headers: { 'www-authenticate': `Digest qop="auth", realm="${realm}", nonce="${NONCE}", algorithm=SHA-256` } });
	}
	const on = plugs.get(name) ?? true;
	if (method === 'Shelly.GetDeviceInfo') return json({ name: null, id: realm, model: 'S4PL-00116US', gen: 4, app: 'PlugUSG4', ver: '1.5.0' });
	if (method === 'Switch.GetStatus') return json({ id: 0, source: 'init', output: on, apower: on ? 3.1 : 0, voltage: 120.4, current: on ? 0.03 : 0 });
	if (method === 'Switch.Set') {
		plugs.set(name, url.searchParams.get('on') === 'true');
		return json({ was_on: on });
	}
	error(404, 'Not found');
};
