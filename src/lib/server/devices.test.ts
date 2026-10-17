import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Polled devices: an ESPHome web server read by Waterline itself, every 5
// minutes, with no token or Home Assistant in between.
const dir = mkdtempSync(join(tmpdir(), 'wl-devices-'));
vi.mock('$env/dynamic/private', () => ({ env: { DATA_DIR: dir } }));
const { createDevicePoll, discoverEsphome, guessParameter, listDevicePolls, parseDeviceUrl, parseEvents, pollAllDevices, pollDevice, readEsphomeSensor, removeDevicePoll, sensorFromJson } = await import('./devices');
const { latestSamples } = await import('./sensors');
const { createTank, listParams } = await import('./tanks');
const { upsertUser } = await import('./users');

const user = upsertUser({ email: 'apollo@example.com', name: 'Apollo', googleSub: 'g-apollo' });
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
