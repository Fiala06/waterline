// Polled devices: Waterline reads a device's own web page, ESPHome's web
// server, every 5 minutes, so a probe like an Apollo logs readings without a
// token, Home Assistant or a reflash. The device's sensors are found by
// listening to its event stream for a moment (it sends every entity's state on
// connecting); each run then asks /sensor/<id> for the ones mapped to a tank
// parameter and stores what they report as sensor readings, apart from tests.
// DEVICE_POLLING=off hides the feature and stops the reading.
import { and, desc, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { devicePolls, type DevicePoll, type PolledSensor } from './db/schema';
import { logger } from './log';
import { decrypt, encrypt } from './secrets';
import { recordSamples } from './sensors';

export const pollingOff = () => env.DEVICE_POLLING === 'off';

/** How long to listen to the device's event stream for its sensors. */
export const DISCOVER_MS = 3_000;
/** How long a sensor has to answer when read. */
const READ_MS = 8_000;
const MAX_BYTES = 256 * 1024;
/** Devices one keeper may read. */
export const MAX_DEVICES = 20;

export interface FoundSensor {
	objectId: string;
	name: string;
	/** null while the device has no value for it (ESPHome's "NA") */
	value: number | null;
	unit: string | null;
	/** as the device shows it: "23.6 °C", "NA" */
	state: string;
}
export interface DeviceAuth {
	username: string;
	password: string;
}

/** A device address as stored: http or https, a host, maybe a port and a path, nothing else. */
export function parseDeviceUrl(input: string): string | null {
	const s = input.trim();
	if (!s) return null;
	let u: URL;
	try {
		u = new URL(s.includes('://') ? s : `http://${s}`);
	} catch {
		return null;
	}
	if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) return null;
	return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** The events in a stretch of an event stream, as { event, data }. */
export function parseEvents(stream: string): { event: string; data: string }[] {
	const out: { event: string; data: string }[] = [];
	for (const block of stream.split(/\r?\n\r?\n/)) {
		let event = 'message';
		const data: string[] = [];
		for (const line of block.split(/\r?\n/)) {
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
		}
		if (data.length) out.push({ event, data: data.join('\n') });
	}
	return out;
}

/** "23.6 °C" → "°C"; nothing from "NA" */
function unitOf(state: string, value: number | null): string | null {
	if (value == null) return null;
	const m = /^-?[\d.]+(?:e[-+]?\d+)?\s*(.+)$/i.exec(state.trim());
	return m ? m[1].trim() || null : null;
}

/**
 * ESPHome's JSON for a sensor, from its event stream or /sensor/<id>: the id
 * is "sensor-<object id>", the value is "NaN" and the state "NA" while it has
 * none, and the name and unit come only with the full detail.
 */
export function sensorFromJson(raw: unknown, known?: { name?: string; unit?: string | null }): FoundSensor | null {
	if (!raw || typeof raw !== 'object') return null;
	const j = raw as Record<string, unknown>;
	const id = typeof j.id === 'string' ? j.id : '';
	if (!id.startsWith('sensor-')) return null;
	const objectId = id.slice('sensor-'.length);
	if (!/^[a-z0-9_]+$/i.test(objectId)) return null;
	const value = typeof j.value === 'number' && Number.isFinite(j.value) ? j.value : null;
	const state = typeof j.state === 'string' ? j.state : value != null ? String(value) : 'NA';
	const name = (typeof j.name === 'string' && j.name) || known?.name || objectId.replace(/_/g, ' ');
	const unit = (typeof j.uom === 'string' && j.uom) || unitOf(state, value) || known?.unit || null;
	return { objectId, name, value, unit, state };
}

function headers(auth: DeviceAuth | null, accept: string): Record<string, string> {
	const h: Record<string, string> = { accept, 'user-agent': 'Waterline' };
	if (auth) h.authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
	return h;
}

/** What went wrong reaching the device, in the keeper's words. */
function reason(e: unknown, url: string): string {
	if (e instanceof Error) {
		if (e.name === 'AbortError' || e.name === 'TimeoutError') return `${url} didn't answer in time.`;
		const cause = (e as Error & { cause?: { code?: string } }).cause;
		if (cause?.code === 'ECONNREFUSED') return `Nothing is listening at ${url}.`;
		if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') return `${new URL(url).hostname} isn't a host this server can find.`;
		if (cause?.code === 'EHOSTUNREACH' || cause?.code === 'ETIMEDOUT' || cause?.code === 'ENETUNREACH') return `${url} can't be reached from this server: the two have to share a network.`;
		if (e.message === 'fetch failed' && cause && typeof cause === 'object' && 'message' in cause) return `${url}: ${String((cause as { message: unknown }).message)}`;
		return e.message;
	}
	return String(e);
}

function statusProblem(status: number, url: string): string {
	if (status === 401) return 'The device asks for a username and password.';
	if (status === 404) return `${url} isn't there: is this an ESPHome device with its web server on?`;
	return `${url} answered ${status}.`;
}

/**
 * The device's sensors, by listening to its event stream for a moment: an
 * ESPHome web server sends the title and every entity's current state on
 * connecting. Throws, in plain words, when it can't be read.
 */
export async function discoverEsphome(base: string, auth: DeviceAuth | null, fetcher: typeof fetch = fetch, waitMs = DISCOVER_MS): Promise<{ title: string | null; sensors: FoundSensor[] }> {
	// the stream never ends on its own: the wait is the deadline for connecting and for reading
	const ctl = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			ctl.abort();
			reject(new Error('deadline'));
		}, waitMs);
	});
	deadline.catch(() => {});
	let stream = '';
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	try {
		let res: Response;
		try {
			res = await Promise.race([fetcher(`${base}/events`, { headers: headers(auth, 'text/event-stream'), signal: ctl.signal }), deadline]);
		} catch (e) {
			throw new Error(reason(e instanceof Error && e.message === 'deadline' ? Object.assign(new Error(), { name: 'TimeoutError' }) : e, base));
		}
		if (!res.ok) throw new Error(statusProblem(res.status, `${base}/events`));
		if (!res.body) throw new Error(`${base} sent nothing.`);
		reader = res.body.getReader();
		const dec = new TextDecoder();
		try {
			while (stream.length < MAX_BYTES) {
				const { value, done } = await Promise.race([reader.read(), deadline]);
				if (done) break;
				stream += dec.decode(value, { stream: true });
			}
		} catch {
			// the wait is over: what came in is what the device has
		}
	} finally {
		clearTimeout(timer);
		reader?.cancel().catch(() => {});
		ctl.abort();
	}
	let title: string | null = null;
	const sensors = new Map<string, FoundSensor>();
	let events = 0;
	for (const ev of parseEvents(stream)) {
		let j: unknown;
		try {
			j = JSON.parse(ev.data);
		} catch {
			continue;
		}
		events++;
		if (ev.event === 'ping' && j && typeof j === 'object' && typeof (j as { title?: unknown }).title === 'string') title = (j as { title: string }).title;
		if (ev.event === 'state') {
			const s = sensorFromJson(j);
			if (s) sensors.set(s.objectId, s);
		}
	}
	if (!events) throw new Error(`${base} isn't an ESPHome web server, or it sent nothing in ${Math.round(waitMs / 1000)} seconds.`);
	return { title, sensors: [...sensors.values()] };
}

/** One sensor's current value, from the device's web page. */
export async function readEsphomeSensor(base: string, s: Pick<PolledSensor, 'objectId' | 'name' | 'unit'>, auth: DeviceAuth | null, fetcher: typeof fetch = fetch): Promise<FoundSensor> {
	const url = `${base}/sensor/${s.objectId}`;
	let res: Response;
	try {
		res = await fetcher(`${url}?detail=all`, { headers: headers(auth, 'application/json'), signal: AbortSignal.timeout(READ_MS) });
	} catch (e) {
		throw new Error(reason(e, base));
	}
	if (!res.ok) throw new Error(res.status === 404 ? `The device has no sensor "${s.name}" any more.` : statusProblem(res.status, url));
	let j: unknown;
	try {
		j = await res.json();
	} catch {
		throw new Error(`${url} didn't answer with a sensor's JSON.`);
	}
	const found = sensorFromJson(j, { name: s.name, unit: s.unit });
	if (!found) throw new Error(`${url} didn't answer with a sensor's JSON.`);
	return found;
}

const paramLabel = (p: { key: string; name: string }) => (p.key === 'custom' ? p.name : p.key);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which of the tank's parameters a device's sensor most likely feeds, as the
 * parameter's key or custom name: by its unit (°C or °F is the temperature,
 * pH is pH), else by a parameter named in the sensor's name ("Tank TDS");
 * nothing for the board's own sensors and anything unclear.
 */
export function guessParameter(sensor: { name: string; unit: string | null }, params: { key: string; name: string }[]): string | null {
	const name = sensor.name.toLowerCase();
	const unit = (sensor.unit ?? '').toLowerCase().replace(/\s+/g, '');
	if (/(^|[^a-z])(board|esp|wifi|rssi|uptime|humidity|battery|signal|cpu)([^a-z]|$)/.test(name)) return null;
	const by = (f: (p: { key: string; name: string }) => boolean) => {
		const p = params.find(f);
		return p ? paramLabel(p) : null;
	};
	if (['°c', '°f', 'c', 'f', 'degc', 'degf', 'celsius', 'fahrenheit'].includes(unit)) return by((p) => p.key === 'temp');
	if (unit === 'ph' || /(^|[^a-z])ph([^a-z]|$)/.test(name)) return by((p) => p.key === 'ph');
	for (const p of params) {
		const words = [p.name, p.key === 'custom' ? '' : p.key].filter((w) => w.length >= 2).map((w) => w.toLowerCase());
		if (words.some((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`).test(name))) return paramLabel(p);
	}
	return null;
}

// ── Stored devices ───────────────────────────────────────────────────────────

/** A polled device as the page sees it: never the password, only whether there is one. */
export type DevicePollView = Omit<DevicePoll, 'passwordEnc'> & { hasPassword: boolean };
const view = (r: DevicePoll): DevicePollView => {
	const { passwordEnc, ...rest } = r;
	return { ...rest, hasPassword: !!passwordEnc };
};
const authOf = (r: DevicePoll): DeviceAuth | null => (r.username ? { username: r.username, password: decrypt(r.passwordEnc) ?? '' } : null);

export function listDevicePolls(userId: string): DevicePollView[] {
	return db.select().from(devicePolls).where(eq(devicePolls.userId, userId)).orderBy(desc(devicePolls.createdAt)).all().map(view);
}

export function createDevicePoll(userId: string, input: { tankId: string; name: string; url: string; sensors: PolledSensor[]; auth: DeviceAuth | null }): DevicePollView {
	const row = db
		.insert(devicePolls)
		.values({
			userId,
			tankId: input.tankId,
			name: input.name.trim().slice(0, 60),
			url: input.url,
			username: input.auth?.username || null,
			passwordEnc: input.auth ? encrypt(input.auth.password) : null,
			sensors: input.sensors
		})
		.returning()
		.get();
	return view(row);
}

export function removeDevicePoll(userId: string, id: string): DevicePollView | null {
	const row = db
		.delete(devicePolls)
		.where(and(eq(devicePolls.id, id), eq(devicePolls.userId, userId)))
		.returning()
		.get();
	return row ? view(row) : null;
}

export interface PollResult {
	/** every mapped sensor was read and what it had stored */
	ok: boolean;
	/** readings stored this run (one a minute per parameter, like a token's) */
	stored: number;
	/** the first thing that went wrong, in the keeper's words */
	error: string | null;
}

/**
 * One run for a device: read each mapped sensor and store what it reports as
 * the tank's sensor readings, with the device's name as the source. A sensor
 * with no value (ESPHome's NA) stores nothing and isn't a problem.
 */
export async function pollDevice(id: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<PollResult> {
	const row = db.select().from(devicePolls).where(eq(devicePolls.id, id)).get();
	if (!row) return { ok: false, stored: 0, error: 'Not found' };
	const auth = authOf(row);
	const samples: { parameter: string; value: number; unit: string | null }[] = [];
	const problems: string[] = [];
	for (const s of row.sensors) {
		try {
			const found = await readEsphomeSensor(row.url, s, auth, fetcher);
			if (found.value == null) continue;
			samples.push({ parameter: s.parameter, value: found.value, unit: found.unit ?? s.unit });
		} catch (e) {
			problems.push(e instanceof Error ? e.message : String(e));
		}
	}
	let stored = 0;
	if (samples.length) {
		for (const r of recordSamples(row.tankId, samples, row.name, null, now)) {
			if (!r.ok) problems.push(r.error);
			else if (r.stored) stored++;
		}
	}
	const at = new Date(now).toISOString();
	const ok = !problems.length;
	db.update(devicePolls)
		.set({ lastPolledAt: at, lastOkAt: ok ? at : row.lastOkAt, lastError: ok ? null : problems[0] })
		.where(eq(devicePolls.id, id))
		.run();
	return { ok, stored, error: ok ? null : problems[0] };
}

/** Every polled device, one after another: the scheduler's run. Logged once when a device stops answering. */
export async function pollAllDevices(fetcher: typeof fetch = fetch, now = Date.now()): Promise<void> {
	if (pollingOff()) return;
	const rows = db.select({ id: devicePolls.id, name: devicePolls.name, userId: devicePolls.userId, tankId: devicePolls.tankId, lastError: devicePolls.lastError }).from(devicePolls).all();
	for (const row of rows) {
		const r = await pollDevice(row.id, fetcher, now);
		if (!r.ok && !row.lastError) logger.warn('sensors', `Couldn't read ${row.name}: ${r.error}`, { userId: row.userId, tankId: row.tankId });
		else if (r.ok && row.lastError) logger.info('sensors', `${row.name} answers again`, { userId: row.userId, tankId: row.tankId });
	}
}
