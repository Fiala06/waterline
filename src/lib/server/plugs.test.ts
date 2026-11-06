import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { eventTitle } from '$lib/events';

const dir = mkdtempSync(join(tmpdir(), 'wl-plugs-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { events } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, getEquipment, removeEquipment } = await import('./specs');
const { digestAuthorization, linkPlug, parseDigestChallenge, plugOf, pollAllPlugs, pollPlug, readPlug, switchPlug, unlinkPlug } = await import('./plugs');

/** A Shelly plug as fetch sees it: Switch.GetStatus / Switch.Set / Shelly.GetDeviceInfo, behind a password when given one. */
function fakePlug(opts: { password?: string } = {}) {
	const state = { on: true, watts: 4.2, calls: [] as string[], down: false };
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (state.down) throw new TypeError('fetch failed');
		const u = new URL(String(input));
		state.calls.push(u.pathname + u.search);
		const auth = new Headers(init?.headers).get('authorization');
		if (opts.password) {
			const nonce = 'abc123';
			const challenge = `Digest qop="auth", realm="shellyplugusg4-aabbcc", nonce="${nonce}", algorithm=SHA-256`;
			const c = auth && parseDigestChallenge(auth);
			const want =
				c && digestAuthorization({ realm: 'shellyplugusg4-aabbcc', nonce }, { username: 'admin', password: opts.password, method: 'GET', uri: u.pathname + u.search, cnonce: c.cnonce, nc: c.nc });
			if (!auth || auth !== want) return new Response('', { status: 401, headers: { 'www-authenticate': challenge } });
		}
		const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
		if (u.pathname.endsWith('/rpc/Shelly.GetDeviceInfo')) return json({ name: 'Doser plug', app: 'PlugUSG4', gen: 4 });
		if (u.pathname.endsWith('/rpc/Switch.GetStatus')) return json({ id: 0, output: state.on, apower: state.on ? state.watts : 0 });
		if (u.pathname.endsWith('/rpc/Switch.Set')) {
			const was = state.on;
			state.on = u.searchParams.get('on') === 'true';
			return json({ was_on: was });
		}
		return new Response('', { status: 404 });
	}) as typeof fetch;
	return { state, fetcher };
}

const user = upsertUser({ email: 'plugs@example.com', name: 'Keeper' });
const tank = createTank(user, { name: 'Plug tank', type: 'planted', nominalVolumeL: 60 });
const item = (model: string) => addEquipment(user.id, tank.id, { type: 'other', brand: 'Jebao', model, specs: {}, installedAt: null, notes: null }, user.timeZone);
const titles = (id: string) =>
	db
		.select()
		.from(events)
		.where(eq(events.tankId, tank.id))
		.all()
		.filter((e) => e.data.equipment_id === id && (e.data.action === 'paused' || e.data.action === 'resumed'))
		.map((e) => eventTitle(e, user));

describe('digest sign-in (RFC 7616, SHA-256)', () => {
	it("matches the RFC's example", () => {
		const c = parseDigestChallenge('Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=SHA-256, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"')!;
		expect(c).toMatchObject({ realm: 'http-auth@example.org', nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v' });
		const h = digestAuthorization(c, { username: 'Mufasa', password: 'Circle of Life', method: 'GET', uri: '/dir/index.html', cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ' });
		expect(h).toContain('response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"');
		expect(h).toContain('opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"');
	});
	it('is only for a digest challenge', () => {
		expect(parseDigestChallenge('Basic realm="x"')).toBeNull();
	});
});

describe('smart plugs (#203)', () => {
	it('reads a plug, signing in when it has a password, and says why when it cannot', async () => {
		const locked = fakePlug({ password: 'hunter2' });
		expect(await readPlug('http://plug', 'hunter2', 0, locked.fetcher)).toEqual({ on: true, watts: 4.2 });
		await expect(readPlug('http://plug', null, 0, locked.fetcher)).rejects.toThrow('The plug asks for its password');
		await expect(readPlug('http://plug', 'nope', 0, locked.fetcher)).rejects.toThrow("The plug's password isn't right");
		locked.state.down = true;
		await expect(readPlug('http://plug', 'hunter2', 0, locked.fetcher)).rejects.toThrow("The plug couldn't be reached");
	});

	it('linked, the item follows the plug: off pauses it, on resumes it, History says the plug did it', async () => {
		const e = item('Doser');
		const plug = fakePlug();
		const p = await linkPlug(user.id, e.id, { url: 'http://plug', password: null }, plug.fetcher);
		expect(p).toMatchObject({ name: 'Doser plug', on: true, watts: 4.2, hasPassword: false });
		expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
		plug.state.on = false;
		expect(await pollPlug(p.id, plug.fetcher)).toEqual({ ok: true, error: null });
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		// read again, still off: nothing more in History
		await pollPlug(p.id, plug.fetcher);
		plug.state.on = true;
		await pollAllPlugs(plug.fetcher);
		expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
		expect(titles(e.id)).toEqual(['Paused Jebao Doser · its plug was switched off', 'Resumed Jebao Doser · its plug was switched on']);
	});

	it('Pause and Resume switch the plug, and change nothing when it does not answer', async () => {
		const e = item('Pump');
		const plug = fakePlug({ password: 'hunter2' });
		await linkPlug(user.id, e.id, { url: 'http://plug2', password: 'hunter2' }, plug.fetcher);
		expect(plugOf(e.id)?.hasPassword).toBe(true);
		await switchPlug(user.id, e.id, false, plug.fetcher);
		expect(plug.state.on).toBe(false);
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		expect(titles(e.id)).toEqual(['Paused Jebao Pump']);
		plug.state.down = true;
		await expect(switchPlug(user.id, e.id, true, plug.fetcher)).rejects.toThrow("The plug couldn't be reached");
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		expect(plugOf(e.id)?.lastError).toBe("The plug couldn't be reached");
		plug.state.down = false;
		await switchPlug(user.id, e.id, true, plug.fetcher);
		expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
		expect(plugOf(e.id)).toMatchObject({ on: true, lastError: null });
	});

	it('linking to a plug that is off pauses the item; a re-link keeps the saved password; unlinked or removed, it is no longer read', async () => {
		const e = item('Heater');
		const plug = fakePlug({ password: 'pw' });
		plug.state.on = false;
		await linkPlug(user.id, e.id, { url: 'http://plug3', password: 'pw' }, plug.fetcher);
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		expect((await linkPlug(user.id, e.id, { url: 'http://plug3', password: null }, plug.fetcher)).hasPassword).toBe(true);
		unlinkPlug(user.id, e.id);
		expect(plugOf(e.id)).toBeNull();
		await linkPlug(user.id, e.id, { url: 'http://plug3', password: 'pw' }, plug.fetcher);
		removeEquipment(user.id, e.id);
		expect(plugOf(e.id)).toBeNull();
	});

	it("a plug that isn't one can't be linked", async () => {
		const e = item('Filter');
		const notAPlug = (async () => new Response('<html></html>', { status: 404 })) as typeof fetch;
		await expect(linkPlug(user.id, e.id, { url: 'http://router', password: null }, notAPlug)).rejects.toThrow("That address isn't a Shelly plug (Gen2 or later)");
		expect(plugOf(e.id)).toBeNull();
	});
});
