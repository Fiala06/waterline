import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Polled devices: an ESPHome web server read by Waterline itself, every 5
// minutes, with no token or Home Assistant in between.
const dir = mkdtempSync(join(tmpdir(), 'wl-devices-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { db } = await import('./db');
const { users } = await import('./db/schema');
const { eq } = await import('drizzle-orm');
const { createDevicePoll, DeviceUnreachable, MAX_SENSORS, discoverEsphome, guessParameter, listDevicePolls, parseDeviceUrl, parseEvents, pollAllDevices, pollDevice, readEsphomeSensor, removeDevicePoll, sensorFromJson } = await import('./devices');
const { latestSamples } = await import('./sensors');
const { createTank, listParams, setArchived } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'apollo@example.com', name: 'Apollo', googleSub: 'g-apollo' });
// an admin is told exactly what went wrong with a device; what everyone else is told is further down
db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id)).run();
const tank = createTank(user, { name: 'Shrimp bowl', type: 'freshwater', nominalVolumeL: 10 });
const temp = listParams(tank.id).find((p) => p.key === 'temp')!;

/** An ESPHome web server: the event stream on connecting, and a sensor on request. */
const SENSORS: Record<string, { name: string; value: number; uom: string }> = {
	temperature_probe: { name: 'Temperature Probe', value: 23.6, uom: '°C' },
	board_temperature: { name: 'Board Temperature', value: 34.91, uom: '°C' },
	food_probe: { name: 'Food Probe', value: NaN, uom: '°C' }
};
const sensorJson = (id: string, all: boolean) => {
	const s = SENSORS[id];
	return { id: `sensor-${id}`, value: Number.isNaN(s.value) ? 'NaN' : s.value, state: Number.isNaN(s.value) ? 'NA' : `${s.value} ${s.uom}`, ...(all ? { name: s.name, uom: s.uom } : {}) };
};
const stream = () =>
	[`event: ping\ndata: ${JSON.stringify({ title: 'Apollo TEMP-1 20f0ac' })}\n`, ...Object.keys(SENSORS).map((id) => `event: state\ndata: ${JSON.stringify(sensorJson(id, true))}\n`)].join('\n') + '\n';

function device(opts: { auth?: string; hang?: boolean; status?: number } = {}) {
	const calls: { url: string; auth: string | null }[] = [];
	const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const h = new Headers(init?.headers);
		calls.push({ url, auth: h.get('authorization') });
		if (opts.auth && h.get('authorization') !== opts.auth) return new Response('', { status: 401 });
		if (opts.status) return new Response('', { status: opts.status });
		const u = new URL(url);
		if (u.pathname.endsWith('/events')) {
			if (opts.hang) {
				// a device that never closes the stream: the states come, then nothing
				const body = new ReadableStream({
					start(c) {
						c.enqueue(new TextEncoder().encode(stream()));
					}
				});
				return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
			}
			return new Response(stream(), { headers: { 'content-type': 'text/event-stream' } });
		}
		const m = /\/sensor\/([a-z0-9_]+)$/.exec(u.pathname);
		if (m && SENSORS[m[1]]) return Response.json(sensorJson(m[1], u.searchParams.get('detail') === 'all'));
		return new Response('Not found', { status: 404 });
	}) as typeof fetch;
	return { fetcher, calls };
}

describe('polled devices', () => {
	it('keeps an address as scheme, host, port and path', () => {
		expect(parseDeviceUrl('192.168.1.33')).toBe('http://192.168.1.33');
		expect(parseDeviceUrl(' http://192.168.1.33/ ')).toBe('http://192.168.1.33');
		expect(parseDeviceUrl('https://probe.local:8080/esp/')).toBe('https://probe.local:8080/esp');
		expect(parseDeviceUrl('http://192.168.1.33/?x=1#y')).toBe('http://192.168.1.33');
		expect(parseDeviceUrl('ftp://192.168.1.33')).toBeNull();
		expect(parseDeviceUrl('http://user:pw@192.168.1.33')).toBeNull();
		expect(parseDeviceUrl('')).toBeNull();
		expect(parseDeviceUrl('not a host')).toBeNull();
	});

	it("reads ESPHome's event stream and sensor JSON, NA included", () => {
		const events = parseEvents('event: ping\ndata: {"title":"T"}\n\nevent: state\ndata: {"id":"sensor-t","value":1,"state":"1 °C"}\n\n');
		expect(events).toEqual([
			{ event: 'ping', data: '{"title":"T"}' },
			{ event: 'state', data: '{"id":"sensor-t","value":1,"state":"1 °C"}' }
		]);
		expect(sensorFromJson({ id: 'sensor-temperature_probe', value: 23.6, state: '23.6 °C' })).toEqual({ objectId: 'temperature_probe', name: 'temperature probe', value: 23.6, unit: '°C', state: '23.6 °C' });
		expect(sensorFromJson({ id: 'sensor-food_probe', value: 'NaN', state: 'NA', name: 'Food Probe', uom: '°C' })).toMatchObject({ value: null, unit: '°C', state: 'NA' });
		expect(sensorFromJson({ id: 'sensor-food_probe', value: 'NaN', state: 'NA' }, { name: 'Food Probe', unit: '°C' })).toMatchObject({ name: 'Food Probe', unit: '°C' });
		expect(sensorFromJson({ id: 'binary_sensor-door', value: true, state: 'ON' })).toBeNull();
		expect(sensorFromJson({ id: 'sensor-../x', value: 1, state: '1' })).toBeNull();
		expect(sensorFromJson('nope')).toBeNull();
	});

	it('guesses the parameter from the unit, then the name, and leaves the board alone', () => {
		const params = [
			{ key: 'temp', name: 'Temperature' },
			{ key: 'ph', name: 'pH' },
			{ key: 'custom', name: 'TDS' },
			{ key: 'no3', name: 'Nitrate' }
		];
		expect(guessParameter({ name: 'Temperature Probe', unit: '°C' }, params)).toBe('temp');
		expect(guessParameter({ name: 'Probe', unit: '°F' }, params)).toBe('temp');
		expect(guessParameter({ name: 'Board Temperature', unit: '°C' }, params)).toBeNull();
		expect(guessParameter({ name: 'ESP Temperature', unit: '°C' }, params)).toBeNull();
		expect(guessParameter({ name: 'Board Humidity', unit: '%' }, params)).toBeNull();
		expect(guessParameter({ name: 'Tank pH', unit: 'pH' }, params)).toBe('ph');
		expect(guessParameter({ name: 'Water TDS', unit: 'ppm' }, params)).toBe('TDS');
		expect(guessParameter({ name: 'NO3', unit: 'ppm' }, params)).toBe('no3');
		expect(guessParameter({ name: 'Conductivity', unit: 'µS/cm' }, params)).toBeNull();
		expect(guessParameter({ name: 'Temperature Probe', unit: '°C' }, [{ key: 'ph', name: 'pH' }])).toBeNull();
	});

	it("finds a device's sensors from its event stream, even one that never closes it", async () => {
		const d = device();
		const found = await discoverEsphome('http://probe', null, d.fetcher);
		expect(found.title).toBe('Apollo TEMP-1 20f0ac');
		expect(found.sensors.map((s) => [s.objectId, s.value, s.unit])).toEqual([
			['temperature_probe', 23.6, '°C'],
			['board_temperature', 34.91, '°C'],
			['food_probe', null, '°C']
		]);
		expect(d.calls[0].url).toBe('http://probe/events');
		const hanging = await discoverEsphome('http://probe', null, device({ hang: true }).fetcher, 200);
		expect(hanging.sensors).toHaveLength(3);
	});

	it('says in plain words when a device can\'t be found or read', async () => {
		await expect(discoverEsphome('http://probe', null, device({ status: 404 }).fetcher)).rejects.toThrow(/isn't there: is this an ESPHome device/);
		await expect(discoverEsphome('http://probe', { username: 'a', password: 'b' }, device({ auth: 'Basic nope' }).fetcher)).rejects.toThrow('The device asks for a username and password.');
		const refused = (async () => {
			throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
		}) as unknown as typeof fetch;
		await expect(discoverEsphome('http://probe', null, refused)).rejects.toThrow('Nothing is listening at http://probe.');
		const html = (async () => new Response('<html>hi</html>', { status: 200 })) as unknown as typeof fetch;
		await expect(discoverEsphome('http://probe', null, html)).rejects.toThrow(/isn't an ESPHome web server/);
		await expect(readEsphomeSensor('http://probe', { objectId: 'gone', name: 'Gone', unit: null }, null, device().fetcher)).rejects.toThrow('The device has no sensor "Gone" any more.');
	});

	it('stores what the mapped sensors report, skips NA, and keeps the sign-in encrypted', async () => {
		const sensors = [
			{ objectId: 'temperature_probe', name: 'Temperature Probe', parameter: 'temp', unit: '°C' },
			{ objectId: 'food_probe', name: 'Food Probe', parameter: 'temp', unit: '°C' }
		];
		const row = createDevicePoll(user.id, { tankId: tank.id, name: 'Apollo', url: 'http://probe', sensors, auth: { username: 'cory', password: 'secret' } });
		expect(row.hasPassword).toBe(true);
		expect('passwordEnc' in row).toBe(false);
		expect(listDevicePolls(user.id).map((d) => d.id)).toEqual([row.id]);

		const d = device({ auth: `Basic ${Buffer.from('cory:secret').toString('base64')}` });
		const t0 = Date.parse('2026-10-13T22:00:00Z');
		expect(await pollDevice(row.id, d.fetcher, t0)).toEqual({ ok: true, stored: 1, error: null });
		expect(d.calls.map((c) => c.url)).toEqual(['http://probe/sensor/temperature_probe?detail=all', 'http://probe/sensor/food_probe?detail=all']);
		expect(d.calls[0].auth).toBe(`Basic ${Buffer.from('cory:secret').toString('base64')}`);
		expect(latestSamples(tank.id).get(temp.id)).toMatchObject({ value: 23.6, source: 'Apollo', at: '2026-10-13T22:00:00.000Z' });
		const after = listDevicePolls(user.id)[0];
		expect(after).toMatchObject({ lastPolledAt: '2026-10-13T22:00:00.000Z', lastOkAt: '2026-10-13T22:00:00.000Z', lastError: null });

		// a minute later, the same again: accepted, not stored twice
		expect(await pollDevice(row.id, d.fetcher, t0 + 30_000)).toEqual({ ok: true, stored: 0, error: null });

		// the device goes away: the problem is kept with the row, the last good time stays
		const gone = device({ status: 500 });
		expect(await pollDevice(row.id, gone.fetcher, t0 + 300_000)).toMatchObject({ ok: false, stored: 0, error: 'http://probe/sensor/temperature_probe answered 500.' });
		expect(listDevicePolls(user.id)[0]).toMatchObject({ lastPolledAt: '2026-10-13T22:05:00.000Z', lastOkAt: '2026-10-13T22:00:30.000Z', lastError: 'http://probe/sensor/temperature_probe answered 500.' });

		// the scheduler's run reads every device; removing one stops it
		await pollAllDevices(d.fetcher, t0 + 600_000);
		expect(listDevicePolls(user.id)[0]).toMatchObject({ lastError: null, lastOkAt: '2026-10-13T22:10:00.000Z' });
		expect(removeDevicePoll(user.id, row.id)?.id).toBe(row.id);
		expect(removeDevicePoll('someone-else', row.id)).toBeNull();
		expect(listDevicePolls(user.id)).toEqual([]);
		expect(await pollDevice(row.id, d.fetcher)).toMatchObject({ ok: false, error: 'Not found' });
	});
});

// ── What a signed-in person who isn't the admin can do with it (#211, #212) ──

const keeper = upsertUser({ email: 'keeper@example.com', name: 'Keeper', googleSub: 'g-keeper' });
const bowl = createTank(keeper, { name: 'Bowl', type: 'freshwater', nominalVolumeL: 10 });
const sensorsNamed = (...ids: string[]) => ids.map((objectId) => ({ objectId, name: objectId, parameter: 'temp', unit: '°C' }));
/** A fetcher that fails as fetch does when nothing answers. */
const refused = () => {
	let calls = 0;
	const fetcher = (async () => {
		calls++;
		throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
	}) as unknown as typeof fetch;
	return { fetcher, calls: () => calls };
};
const GENERAL = "Waterline couldn't read an ESPHome device at http://probe. Check the address, that its web server is on, and its username and password if it has them.";

describe('a device is read without following it elsewhere or taking all it sends (#212)', () => {
	it('never follows a redirect, when finding a device or reading it', async () => {
		const seen: (string | undefined)[] = [];
		const d = device();
		const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
			seen.push(init?.redirect);
			return d.fetcher(input, init);
		}) as typeof fetch;
		await discoverEsphome('http://probe', null, fetcher);
		await readEsphomeSensor('http://probe', { objectId: 'temperature_probe', name: 'T', unit: null }, null, fetcher);
		expect(seen).toEqual(['error', 'error']);
	});

	it('stops reading an answer far longer than a sensor’s JSON', async () => {
		let sent = 0;
		const fetcher = (async () =>
			new Response(
				new ReadableStream<Uint8Array>({
					pull(c) {
						sent++;
						c.enqueue(new Uint8Array(64 * 1024).fill(32));
					}
				})
			)) as unknown as typeof fetch;
		await expect(readEsphomeSensor('http://probe', { objectId: 'x', name: 'X', unit: null }, null, fetcher)).rejects.toThrow("sent far more than a sensor's JSON");
		expect(sent).toBeLessThan(10);
	});

	it('tells an admin what went wrong, and everyone else the same thing whatever it was', async () => {
		const s = { objectId: 'temperature_probe', name: 'T', unit: null };
		await expect(readEsphomeSensor('http://probe', s, null, refused().fetcher)).rejects.toThrow('Nothing is listening at http://probe.');
		const told: string[] = [];
		const why = (e: unknown) => told.push((e as Error).message);
		await readEsphomeSensor('http://probe', s, null, refused().fetcher, false).catch(why);
		await readEsphomeSensor('http://probe', s, null, device({ status: 500 }).fetcher, false).catch(why);
		await readEsphomeSensor('http://probe', { ...s, objectId: 'gone' }, null, device().fetcher, false).catch(why);
		await discoverEsphome('http://probe', null, refused().fetcher, 200, false).catch(why);
		await discoverEsphome('http://probe', null, device({ status: 404 }).fetcher, 200, false).catch(why);
		await discoverEsphome('http://probe', null, device({ auth: 'Basic nope' }).fetcher, 200, false).catch(why);
		await discoverEsphome('http://probe', null, (async () => new Response('<html>hello</html>')) as unknown as typeof fetch, 200, false).catch(why);
		expect(told).toEqual(Array(7).fill(GENERAL));
	});

	it('keeps that general message with the device of someone who isn’t an admin', async () => {
		const row = createDevicePoll(keeper.id, { tankId: bowl.id, name: 'Probe', url: 'http://probe', sensors: sensorsNamed('temperature_probe'), auth: null });
		expect(await pollDevice(row.id, device({ status: 500 }).fetcher)).toMatchObject({ ok: false, error: GENERAL });
		expect(listDevicePolls(keeper.id)[0].lastError).toBe(GENERAL);
		removeDevicePoll(keeper.id, row.id);
	});
});

describe('one device can’t hold a run up (#211)', () => {
	it('keeps each sensor once, and 32 at most', () => {
		const many = sensorsNamed('a', 'b', 'a', ...Array.from({ length: 50 }, (_, i) => `s${i}`));
		const row = createDevicePoll(keeper.id, { tankId: bowl.id, name: 'Many', url: 'http://probe', sensors: many, auth: null });
		expect(row.sensors).toHaveLength(MAX_SENSORS);
		expect(row.sensors.slice(0, 3).map((s) => s.objectId)).toEqual(['a', 'b', 's0']);
		removeDevicePoll(keeper.id, row.id);
	});

	it('gives up on a device that can’t be reached at its first sensor', async () => {
		const row = createDevicePoll(keeper.id, { tankId: bowl.id, name: 'Dead', url: 'http://probe', sensors: sensorsNamed('a', 'b', 'c', 'd', 'e'), auth: null });
		const dead = refused();
		expect(await pollDevice(row.id, dead.fetcher)).toMatchObject({ ok: false, stored: 0 });
		expect(dead.calls()).toBe(1);
		await expect(readEsphomeSensor('http://probe', { objectId: 'a', name: 'A', unit: null }, null, dead.fetcher, false)).rejects.toBeInstanceOf(DeviceUnreachable);
		// one that answers, just not with a sensor, is asked for each: the others may be fine
		const odd = device({ status: 500 });
		await pollDevice(row.id, odd.fetcher);
		expect(odd.calls).toHaveLength(5);
		removeDevicePoll(keeper.id, row.id);
	});

	it('reads a few devices at a time, stamps each when it was read, and leaves an archived tank’s alone', async () => {
		const shelf = createTank(keeper, { name: 'Shelf', type: 'freshwater', nominalVolumeL: 10 });
		const rows = Array.from({ length: 9 }, (_, i) => createDevicePoll(keeper.id, { tankId: bowl.id, name: `Probe ${i}`, url: `http://probe-${i}`, sensors: sensorsNamed('temperature_probe'), auth: null }));
		const archived = createDevicePoll(keeper.id, { tankId: shelf.id, name: 'Shelved', url: 'http://shelved', sensors: sensorsNamed('temperature_probe'), auth: null });
		setArchived(keeper.id, shelf.id, true);
		let inFlight = 0;
		let most = 0;
		const hosts: string[] = [];
		const d = device();
		const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
			hosts.push(new URL(String(input)).hostname);
			most = Math.max(most, ++inFlight);
			await new Promise((r) => setTimeout(r, 15));
			inFlight--;
			return d.fetcher(input, init);
		}) as typeof fetch;
		const before = Date.now();
		await pollAllDevices(fetcher);
		expect(hosts.toSorted()).toEqual(rows.map((_, i) => `probe-${i}`));
		expect(most).toBeGreaterThan(1);
		expect(most).toBeLessThanOrEqual(4);
		const polled = listDevicePolls(keeper.id);
		expect(polled.find((p) => p.id === archived.id)?.lastPolledAt).toBeNull();
		const times = polled.filter((p) => p.id !== archived.id).map((p) => Date.parse(p.lastPolledAt!));
		expect(Math.min(...times)).toBeGreaterThanOrEqual(before);
		// not one time for the whole run: the last was read after the first
		expect(Math.max(...times)).toBeGreaterThan(Math.min(...times));

		// out of time: none is started, and they wait for the next run
		hosts.length = 0;
		await pollAllDevices(fetcher, undefined, 0);
		expect(hosts).toEqual([]);
		for (const r of [...rows, archived]) removeDevicePoll(keeper.id, r.id);
	});
});
