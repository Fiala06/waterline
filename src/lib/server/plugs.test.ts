import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { eventTitle } from '$lib/events';

const dir = mkdtempSync(join(tmpdir(), 'wl-plugs-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir, ORIGIN: 'http://waterline.lan:3000' } }));
const { db } = await import('./db');
const { autoDoses } = await import('./db/schema');
const { events } = await import('./db/schema');
const { upsertUser } = await import('./users');
const { createTank } = await import('./tanks');
const { addEquipment, getEquipment, removeEquipment } = await import('./specs');
const { digestAuthorization, linkPlug, parseDigestChallenge, plugOf, plugReported, pollAllPlugs, pollPlug, readPlug, runPlugFor, switchPlug, unlinkPlug } = await import('./plugs');
const { logDueDoses, syncDoses } = await import('./dosers');
const { equipmentPlugs } = await import('./db/schema');

/**
 * A Shelly plug as fetch sees it: POST /rpc with {id, method, params}, behind a
 * password when given one; it keeps webhooks and schedules, and records the calls.
 */
function fakePlug(opts: { password?: string; on?: boolean; autoOff?: number | null } = {}) {
	const state = {
		on: opts.on ?? true,
		watts: 4.2,
		calls: [] as { method: string; params: Record<string, unknown> }[],
		down: false,
		hooks: [] as { id: number; event: string; name: string; urls: string[] }[],
		jobs: [{ id: 7, enable: true, calls: [{ method: 'Switch.Set', params: { id: 0, on: true } }] }],
		autoOff: opts.autoOff ?? null
	};
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (state.down) throw new TypeError('fetch failed');
		const u = new URL(String(input));
		const auth = new Headers(init?.headers).get('authorization');
		if (opts.password) {
			const nonce = 'abc123';
			const challenge = `Digest qop="auth", realm="shellyplugusg4-aabbcc", nonce="${nonce}", algorithm=SHA-256`;
			const c = auth && parseDigestChallenge(auth);
			const want =
				c && digestAuthorization({ realm: 'shellyplugusg4-aabbcc', nonce }, { username: 'admin', password: opts.password, method: 'POST', uri: u.pathname, cnonce: c.cnonce, nc: c.nc });
			if (!auth || auth !== want) return new Response('', { status: 401, headers: { 'www-authenticate': challenge } });
		}
		if (!u.pathname.endsWith('/rpc') || init?.method !== 'POST') return new Response('', { status: 404 });
		const { method, params = {} } = JSON.parse(String(init.body));
		state.calls.push({ method, params });
		const ok = (result: unknown) => new Response(JSON.stringify({ id: 1, src: 'shellyplugusg4-aabbcc', result }), { headers: { 'content-type': 'application/json' } });
		switch (method) {
			case 'Shelly.GetDeviceInfo':
				return ok({ name: 'Doser plug', app: 'PlugUSG4', gen: 4 });
			case 'Switch.GetStatus':
				return ok({ id: 0, output: state.on, apower: state.on ? state.watts : 0 });
			case 'Switch.GetConfig':
				return ok({ id: 0, auto_off: !!state.autoOff, auto_off_delay: state.autoOff ?? 60 });
			case 'Switch.Set': {
				const was = state.on;
				state.on = params.on === true;
				return ok({ was_on: was });
			}
			case 'Webhook.List':
				return ok({ hooks: state.hooks });
			case 'Webhook.Create':
				state.hooks.push({ id: state.hooks.length + 100, event: params.event, name: params.name, urls: params.urls });
				return ok({ id: state.hooks.length + 99 });
			case 'Webhook.Delete':
				state.hooks = state.hooks.filter((h) => h.id !== params.id);
				return ok({});
			case 'Schedule.List':
				return ok({ jobs: state.jobs });
			case 'Schedule.Update': {
				const j = state.jobs.find((x) => x.id === params.id)!;
				j.enable = params.enable;
				return ok({});
			}
		}
		return new Response(JSON.stringify({ id: 1, error: { code: -114, message: 'not found' } }), { status: 404 });
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
		await unlinkPlug(user.id, e.id, plug.fetcher);
		expect(plug.state.hooks).toEqual([]);
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

	it('linking sets the plug up to report each switch to Waterline, replacing its own old hooks', async () => {
		const e = item('Return pump');
		const plug = fakePlug();
		plug.state.hooks.push({ id: 1, event: 'switch.on', name: 'Waterline on', urls: ['http://old/plug-hook/x/on'] }, { id: 2, event: 'input.toggle', name: 'Lights', urls: ['http://hue'] });
		const p = await linkPlug(user.id, e.id, { url: 'http://plug5', password: null }, plug.fetcher);
		expect(p.hooksAt).not.toBeNull();
		const token = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.id, p.id)).get()!.hookToken!;
		expect(plug.state.hooks.map((h) => [h.event, h.urls[0]])).toEqual([
			['input.toggle', 'http://hue'],
			['switch.on', `http://waterline.lan:3000/plug-hook/${token}/on`],
			['switch.off', `http://waterline.lan:3000/plug-hook/${token}/off`]
		]);
		// a report of off pauses an item that runs all the time, at once
		expect(plugReported(token, false)).toBe(true);
		expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
		expect(plugReported('0'.repeat(48), true)).toBe(false);
	});

	describe('a doser on its plug (#205)', () => {
		const setup = async (name: string) => {
			const e = addEquipment(user.id, tank.id, { type: 'doser', brand: 'BRS', model: name, specs: {}, installedAt: null, notes: null }, user.timeZone);
			syncDoses(user, e, [{ id: null, product: 'Thrive+', amountMl: 2.5, at: '10:30', seconds: 30, weekdays: null, paused: false }], new Date('2026-11-05T08:00:00Z'));
			const plug = fakePlug({ on: false, autoOff: 30 });
			const p = await linkPlug(user.id, e.id, { url: `http://${name}`, password: null }, plug.fetcher);
			const token = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.id, p.id)).get()!.hookToken!;
			const doses = () => db.select().from(events).where(eq(events.tankId, tank.id)).all().filter((x) => x.category === 'dosing' && x.data.doser_id === e.id);
			return { e, plug, p, token, doses };
		};

		it("off between doses isn't paused; each run is a dose with how long, the amount at the dose's rate", async () => {
			const { e, p, token, doses } = await setup('Doser1');
			expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
			expect(p).toMatchObject({ runs: true, autoOffS: 30 });
			const t0 = Date.parse('2026-11-05T10:30:00Z');
			plugReported(token, true, t0);
			plugReported(token, false, t0 + 45_000);
			const [d] = doses();
			expect(d.occurredAt).toBe('2026-11-05T10:30:00.000Z');
			expect(d.data).toMatchObject({ product: 'Thrive+', amount: 3.75, unit: 'mL', seconds: 45, by: 'plug', doser_id: e.id });
			expect(eventTitle(d, user)).toBe('Dosed Thrive+ · 3.75 mL · ran 45 s');
			expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
			// the clock no longer logs it: its plug reports the runs
			expect(await logDueDoses(new Date('2026-11-06T11:00:00Z'))).toBe(0);
		});

		it('a run whose off report was missed is closed by the next read, at the plug\'s auto-off', async () => {
			const { p, token, plug, doses } = await setup('Doser2');
			plugReported(token, true, Date.parse('2026-11-05T10:30:00Z'));
			plug.state.on = false;
			await pollPlug(p.id, plug.fetcher);
			expect(doses()[0].data).toMatchObject({ amount: 2.5, seconds: 30 });
		});

		it('Pause switches its schedules on the plug off (and the plug), Resume back on, never switching it on', async () => {
			const { e, plug } = await setup('Doser3');
			await switchPlug(user.id, e.id, false, plug.fetcher);
			expect(plug.state.jobs[0].enable).toBe(false);
			expect(getEquipment(user.id, e.id).pausedAt).not.toBeNull();
			await switchPlug(user.id, e.id, true, plug.fetcher);
			expect(plug.state.jobs[0].enable).toBe(true);
			expect(plug.state.on).toBe(false);
			expect(getEquipment(user.id, e.id).pausedAt).toBeNull();
		});

		it('Run for… asks the plug to switch itself off after it, and the run is a dose once it ends', async () => {
			const { e, p, token, plug, doses } = await setup('Doser4');
			await runPlugFor(user.id, e.id, 12, plug.fetcher);
			expect(plug.state.calls.find((c) => c.method === 'Switch.Set')?.params).toEqual({ id: 0, on: true, toggle_after: 12 });
			expect(plugOf(e.id)).toMatchObject({ runPlannedS: 12 });
			// the plug's off report closes it
			plugReported(token, false, Date.parse(plugOf(e.id)!.runStartedAt!) + 12_000);
			expect(doses()[0].data).toMatchObject({ amount: 1, seconds: 12 });
			expect(plugOf(p.equipmentId)?.runStartedAt).toBeNull();
			await expect(runPlugFor(user.id, e.id, 0, plug.fetcher)).rejects.toThrow();
		});
	});
});
