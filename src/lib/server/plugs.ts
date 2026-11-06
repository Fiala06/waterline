// Smart plugs (#203): an equipment item tied to the Shelly plug it runs from,
// on the keeper's own network. Waterline speaks the plug's own RPC API (Gen2
// and later: Plus, Pro, Gen3, Gen4, such as the Plug US Gen4) over HTTP, with
// its password when one is set (digest auth, SHA-256, user admin). The
// scheduler reads each plug every 5 minutes: switched off, its item is paused
// and sits in Needs attention; back on, it resumes. Pause and Resume in
// Waterline switch the plug, and change nothing when the plug doesn't answer.
// DEVICE_POLLING=off stops the reading, as it does for ESPHome devices.
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { equipment, equipmentPlugs, tanks, users, type EquipmentPlug } from './db/schema';
import { parseDeviceUrl, pollingOff } from './devices';
import { logger } from './log';
import { requireRoleOn } from './members';
import { decrypt, encrypt } from './secrets';
import { getEquipment, setEquipmentPaused } from './specs';

/** How long a plug has to answer. */
const PLUG_MS = 6_000;
const MAX_BYTES = 64 * 1024;

export { parseDeviceUrl as parsePlugUrl, pollingOff as plugsOff };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** The fields of a WWW-Authenticate: Digest challenge. */
export function parseDigestChallenge(header: string): Record<string, string> | null {
	if (!/^\s*digest\s/i.test(header)) return null;
	const out: Record<string, string> = {};
	for (const m of header.replace(/^\s*digest\s+/i, '').matchAll(/([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]*))/gi)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
	return out;
}

/**
 * The Authorization header for a digest challenge (RFC 7616, SHA-256, qop
 * auth), as a Shelly asks for it. `cnonce` is given in tests.
 */
export function digestAuthorization(
	c: Record<string, string>,
	opts: { username: string; password: string; method: string; uri: string; cnonce?: string; nc?: string }
): string {
	const nc = opts.nc ?? '00000001';
	const cnonce = opts.cnonce ?? randomBytes(8).toString('hex');
	const ha1 = sha256(`${opts.username}:${c.realm}:${opts.password}`);
	const ha2 = sha256(`${opts.method}:${opts.uri}`);
	const response = sha256(`${ha1}:${c.nonce}:${nc}:${cnonce}:auth:${ha2}`);
	return [
		`Digest username="${opts.username}"`,
		`realm="${c.realm}"`,
		`nonce="${c.nonce}"`,
		`uri="${opts.uri}"`,
		'algorithm=SHA-256',
		`response="${response}"`,
		'qop=auth',
		`nc=${nc}`,
		`cnonce="${cnonce}"`,
		...(c.opaque ? [`opaque="${c.opaque}"`] : [])
	].join(', ');
}

/** A problem talking to the plug, in words for the keeper. */
export class PlugError extends Error {}

/**
 * One call of the plug's RPC API: GET <base>/rpc/<method>?<params>, signed in
 * when the plug asks and a password is known.
 */
export async function shellyRpc(base: string, method: string, params: Record<string, string | number | boolean>, password: string | null, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
	const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
	const url = `${base}/rpc/${method}${query ? `?${query}` : ''}`;
	const call = async (authorization?: string) => {
		try {
			return await fetcher(url, { headers: { accept: 'application/json', ...(authorization ? { authorization } : {}) }, signal: AbortSignal.timeout(PLUG_MS), redirect: 'error' });
		} catch (e) {
			const why = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? "didn't answer in time" : "couldn't be reached";
			throw new PlugError(`The plug ${why}`);
		}
	};
	let res = await call();
	if (res.status === 401) {
		const challenge = parseDigestChallenge(res.headers.get('www-authenticate') ?? '');
		if (!password) throw new PlugError('The plug asks for its password');
		if (!challenge?.nonce) throw new PlugError("The plug's sign-in isn't one Waterline knows");
		const u = new URL(url);
		res = await call(digestAuthorization(challenge, { username: 'admin', password, method: 'GET', uri: u.pathname + u.search }));
		if (res.status === 401) throw new PlugError("The plug's password isn't right");
	}
	if (res.status === 404) throw new PlugError("That address isn't a Shelly plug (Gen2 or later)");
	if (!res.ok) throw new PlugError(`The plug answered ${res.status}`);
	const body = await res.text();
	if (body.length > MAX_BYTES) throw new PlugError('The plug sent too much');
	try {
		const data = JSON.parse(body);
		if (data && typeof data === 'object') return data as Record<string, unknown>;
	} catch {
		/* below */
	}
	throw new PlugError("That address isn't a Shelly plug (Gen2 or later)");
}

export interface PlugState {
	on: boolean;
	/** what it draws now, when it measures it */
	watts: number | null;
}

/** On or off, and the power it draws: Switch.GetStatus. */
export async function readPlug(base: string, password: string | null, switchId = 0, fetcher: typeof fetch = fetch): Promise<PlugState> {
	const s = await shellyRpc(base, 'Switch.GetStatus', { id: switchId }, password, fetcher);
	if (typeof s.output !== 'boolean') throw new PlugError("That address isn't a Shelly plug (Gen2 or later)");
	return { on: s.output, watts: typeof s.apower === 'number' && Number.isFinite(s.apower) ? s.apower : null };
}

/** Its name as the Shelly app has it, or its model: Shelly.GetDeviceInfo. */
async function plugName(base: string, password: string | null, fetcher: typeof fetch): Promise<string | null> {
	const info = await shellyRpc(base, 'Shelly.GetDeviceInfo', {}, password, fetcher);
	const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
	return s(info.name) ?? s(info.app) ?? s(info.model);
}

// ── An item's plug ─────────────────────────────────────────────────────────────

export type PlugView = Omit<EquipmentPlug, 'passwordEnc'> & { hasPassword: boolean };
const view = ({ passwordEnc, ...p }: EquipmentPlug): PlugView => ({ ...p, hasPassword: !!passwordEnc });

export function plugOf(equipmentId: string): PlugView | null {
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, equipmentId)).get();
	return p ? view(p) : null;
}

/** The plugs of a tank's items, by the item's id. */
export function plugsOfTank(tankId: string): Map<string, PlugView> {
	return new Map(db.select().from(equipmentPlugs).where(eq(equipmentPlugs.tankId, tankId)).all().map((p) => [p.equipmentId, view(p)]));
}

/**
 * Tie an item to its plug (the owner): the plug must answer, and the item
 * follows it from now on, paused at once when it's off. A password left blank
 * keeps the one saved before.
 */
export async function linkPlug(userId: string, equipmentId: string, input: { url: string; password: string | null }, fetcher: typeof fetch = fetch): Promise<PlugView> {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	if (e.removedAt) error(400, 'That equipment was removed');
	const before = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	const password = input.password ?? (before?.url === input.url ? decrypt(before.passwordEnc) : null);
	const name = await plugName(input.url, password, fetcher);
	const state = await readPlug(input.url, password, 0, fetcher);
	const at = new Date().toISOString();
	const fields = { url: input.url, name, passwordEnc: password ? encrypt(password) : null, switchId: 0, on: state.on, watts: state.watts, lastPolledAt: at, lastOkAt: at, lastError: null };
	if (before) db.update(equipmentPlugs).set(fields).where(eq(equipmentPlugs.id, before.id)).run();
	else db.insert(equipmentPlugs).values({ ...fields, equipmentId: e.id, tankId: e.tankId }).run();
	follow(e.id, state.on, at);
	return plugOf(e.id)!;
}

export function unlinkPlug(userId: string, equipmentId: string) {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	db.delete(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).run();
	return e;
}

/** The item follows its plug: off, paused (said in History as the plug's doing); on, resumed. */
function follow(equipmentId: string, on: boolean, at: string) {
	const row = db
		.select({ e: equipment, owner: users })
		.from(equipment)
		.innerJoin(tanks, eq(tanks.id, equipment.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(eq(equipment.id, equipmentId))
		.get();
	if (!row || row.e.removedAt || !!row.e.pausedAt === !on) return;
	setEquipmentPaused(row.owner.id, equipmentId, !on, row.owner.timeZone, at, { byPlug: true });
}

/**
 * Switch an item's plug off (pause) or on (resume), from Waterline (the
 * owner). The item changes only once the plug says it has switched.
 */
export async function switchPlug(userId: string, equipmentId: string, on: boolean, fetcher: typeof fetch = fetch): Promise<PlugState> {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	if (!p) error(400, 'No plug is linked to it');
	const password = decrypt(p.passwordEnc);
	const at = new Date().toISOString();
	let state: PlugState;
	try {
		await shellyRpc(p.url, 'Switch.Set', { id: p.switchId, on }, password, fetcher);
		state = await readPlug(p.url, password, p.switchId, fetcher);
		if (state.on !== on) throw new PlugError(`The plug stayed ${state.on ? 'on' : 'off'}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		db.update(equipmentPlugs).set({ lastPolledAt: at, lastError: msg }).where(eq(equipmentPlugs.id, p.id)).run();
		throw err instanceof PlugError ? err : new PlugError(msg);
	}
	db.update(equipmentPlugs).set({ on: state.on, watts: state.watts, lastPolledAt: at, lastOkAt: at, lastError: null }).where(eq(equipmentPlugs.id, p.id)).run();
	setEquipmentPaused(userId, e.id, !on, zoneOf(userId), at);
	return state;
}

const zoneOf = (userId: string) => db.select({ tz: users.timeZone }).from(users).where(eq(users.id, userId)).get()?.tz ?? 'UTC';

/** One plug read: its state kept, and its item following it. */
export async function pollPlug(id: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<{ ok: boolean; error: string | null }> {
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.id, id)).get();
	if (!p) return { ok: false, error: 'Not found' };
	const at = new Date(now).toISOString();
	try {
		const state = await readPlug(p.url, decrypt(p.passwordEnc), p.switchId, fetcher);
		db.update(equipmentPlugs).set({ on: state.on, watts: state.watts, lastPolledAt: at, lastOkAt: at, lastError: null }).where(eq(equipmentPlugs.id, p.id)).run();
		follow(p.equipmentId, state.on, at);
		return { ok: true, error: null };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		db.update(equipmentPlugs).set({ lastPolledAt: at, lastError: msg }).where(eq(equipmentPlugs.id, p.id)).run();
		return { ok: false, error: msg };
	}
}

/** Every plug, one after another: the scheduler's run. Logged once when a plug stops answering. */
export async function pollAllPlugs(fetcher: typeof fetch = fetch, now = Date.now()): Promise<void> {
	if (pollingOff()) return;
	const rows = db
		.select({ id: equipmentPlugs.id, tankId: equipmentPlugs.tankId, lastError: equipmentPlugs.lastError, userId: tanks.userId, archivedAt: tanks.archivedAt, removedAt: equipment.removedAt })
		.from(equipmentPlugs)
		.innerJoin(tanks, eq(tanks.id, equipmentPlugs.tankId))
		.innerJoin(equipment, eq(equipment.id, equipmentPlugs.equipmentId))
		.all();
	for (const row of rows) {
		if (row.archivedAt || row.removedAt) continue;
		const r = await pollPlug(row.id, fetcher, now);
		if (!r.ok && !row.lastError) logger.warn('sensors', `A smart plug stopped answering: ${r.error}`, { userId: row.userId, tankId: row.tankId });
		else if (r.ok && row.lastError) logger.info('sensors', 'A smart plug answers again', { userId: row.userId, tankId: row.tankId });
	}
}
