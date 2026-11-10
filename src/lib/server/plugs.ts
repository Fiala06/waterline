// Smart plugs (#203): an equipment item tied to the Shelly plug it runs from,
// on the keeper's own network. Waterline speaks the plug's own RPC API (Gen2
// and later: Plus, Pro, Gen3, Gen4, such as the Plug US Gen4) as JSON-RPC over
// HTTP, with its password when one is set (digest auth, SHA-256, user admin).
//
// Most equipment runs all the time: switched off at its plug, it's paused and
// sits in Needs attention; back on, it resumes. Pause and Resume switch it.
//
// A doser that just runs while it has power (#205) is off between doses, with
// its schedule and auto-off in the Shelly app: off isn't paused, and each run
// is logged as a dose with when and how long. The plug reports each switch to
// Waterline the moment it happens, through webhooks Waterline sets up on it
// when it's linked (/plug-hook/<token>/on|off). Pause turns the plug's own
// schedules off, and Resume back on. Run for… switches any linked plug on for
// a while, and the plug switches itself off after it.
//
// The scheduler also reads each plug every 5 minutes, for its state and power,
// and to close a run whose off report was missed. DEVICE_POLLING=off stops it.
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { BodyTooLarge, readCappedText } from './capped-body';
import { db } from './db';
import { equipment, equipmentPlugs, tanks, users, type Equipment, type EquipmentPlug } from './db/schema';
import { parseDeviceUrl, pollingOff } from './devices';
import { logPlugRun } from './dosers';
import { logger } from './log';
import { requireRoleOn } from './members';
import { decrypt, encrypt } from './secrets';
import { getEquipment, setEquipmentPaused } from './specs';

/** How long a plug has to answer. */
const PLUG_MS = 6_000;
const MAX_BYTES = 64 * 1024;
/** The longest Run for… */
export const MAX_RUN_S = 3600;
/** A run longer than this without its off report is closed at its planned length, or left out. */
const STALE_RUN_MS = 6 * 3600_000;

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

const NOT_A_PLUG = "That address isn't a Shelly plug (Gen2 or later)";

/**
 * One call of the plug's RPC API: POST <base>/rpc with {id, method, params},
 * signed in when the plug asks and a password is known. Gives the call's result.
 */
export async function shellyRpc(base: string, method: string, params: Record<string, unknown>, password: string | null, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
	const url = `${base}/rpc`;
	const body = JSON.stringify({ id: 1, method, params });
	const call = async (authorization?: string) => {
		try {
			return await fetcher(url, {
				method: 'POST',
				body,
				headers: { 'content-type': 'application/json', accept: 'application/json', ...(authorization ? { authorization } : {}) },
				signal: AbortSignal.timeout(PLUG_MS),
				redirect: 'error'
			});
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
		res = await call(digestAuthorization(challenge, { username: 'admin', password, method: 'POST', uri: new URL(url).pathname }));
		if (res.status === 401) throw new PlugError("The plug's password isn't right");
	}
	if (res.status === 404) throw new PlugError(NOT_A_PLUG);
	let text: string;
	try {
		// counted as it arrives, so a plug (or something posing as one) can't have it all buffered first (#212)
		text = await readCappedText(res, MAX_BYTES);
	} catch (e) {
		throw new PlugError(e instanceof BodyTooLarge ? 'The plug sent too much' : "The plug didn't answer in time");
	}
	let data: { result?: unknown; error?: { message?: unknown } } | null = null;
	try {
		data = JSON.parse(text);
	} catch {
		/* below */
	}
	if (data?.error) throw new PlugError(`The plug said: ${typeof data.error.message === 'string' ? data.error.message : 'error'}`);
	if (!res.ok) throw new PlugError(`The plug answered ${res.status}`);
	if (data?.result && typeof data.result === 'object') return data.result as Record<string, unknown>;
	if (data && 'result' in data) return {};
	throw new PlugError(NOT_A_PLUG);
}

export interface PlugState {
	on: boolean;
	/** what it draws now, when it measures it */
	watts: number | null;
}

/** On or off, and the power it draws: Switch.GetStatus. */
export async function readPlug(base: string, password: string | null, switchId = 0, fetcher: typeof fetch = fetch): Promise<PlugState> {
	const s = await shellyRpc(base, 'Switch.GetStatus', { id: switchId }, password, fetcher);
	if (typeof s.output !== 'boolean') throw new PlugError(NOT_A_PLUG);
	return { on: s.output, watts: typeof s.apower === 'number' && Number.isFinite(s.apower) ? s.apower : null };
}

/** Its name as the Shelly app has it, or its model: Shelly.GetDeviceInfo. */
async function plugName(base: string, password: string | null, fetcher: typeof fetch): Promise<string | null> {
	const info = await shellyRpc(base, 'Shelly.GetDeviceInfo', {}, password, fetcher);
	const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
	return s(info.name) ?? s(info.app) ?? s(info.model);
}

/** How long it switches itself off after (its auto-off in the Shelly app), in seconds, or null. */
async function autoOff(base: string, password: string | null, switchId: number, fetcher: typeof fetch): Promise<number | null> {
	const c = await shellyRpc(base, 'Switch.GetConfig', { id: switchId }, password, fetcher);
	return c.auto_off === true && typeof c.auto_off_delay === 'number' && c.auto_off_delay > 0 ? Math.round(c.auto_off_delay) : null;
}

// ── Reports from the plug (#205) ────────────────────────────────────────────────

const HOOK_PREFIX = 'Waterline';

/** Where the plug reports to: Waterline's own address (ORIGIN), or the one given for it. */
export function reportBase(p: Pick<EquipmentPlug, 'reportUrl'>): string | null {
	const base = (p.reportUrl || env.ORIGIN || '').trim().replace(/\/+$/, '');
	return base || null;
}

/**
 * Set the plug up to report each switch on and off to Waterline: its
 * webhooks named Waterline… are replaced by one for each, at this plug's
 * address under /plug-hook. Gives when they were set up, or why not.
 */
async function installHooks(p: EquipmentPlug, password: string | null, fetcher: typeof fetch): Promise<{ hooksAt: string | null; hooksError: string | null }> {
	const base = reportBase(p);
	if (!base || !p.hookToken) return { hooksAt: null, hooksError: "Waterline's own address isn't set (ORIGIN)" };
	try {
		const list = await shellyRpc(p.url, 'Webhook.List', {}, password, fetcher);
		const hooks = Array.isArray(list.hooks) ? (list.hooks as { id?: unknown; name?: unknown }[]) : [];
		for (const h of hooks) if (typeof h.name === 'string' && h.name.startsWith(HOOK_PREFIX) && typeof h.id === 'number') await shellyRpc(p.url, 'Webhook.Delete', { id: h.id }, password, fetcher);
		for (const state of ['on', 'off'] as const)
			await shellyRpc(
				p.url,
				'Webhook.Create',
				{ cid: p.switchId, enable: true, event: `switch.${state}`, name: `${HOOK_PREFIX} ${state}`, urls: [`${base}/plug-hook/${p.hookToken}/${state}`] },
				password,
				fetcher
			);
		return { hooksAt: new Date().toISOString(), hooksError: null };
	} catch (e) {
		return { hooksAt: null, hooksError: e instanceof Error ? e.message : String(e) };
	}
}

/** Take Waterline's webhooks off the plug, when it's unlinked; a plug that doesn't answer keeps them, pointing nowhere that answers. */
async function removeHooks(p: EquipmentPlug, fetcher: typeof fetch) {
	try {
		const password = decrypt(p.passwordEnc);
		const list = await shellyRpc(p.url, 'Webhook.List', {}, password, fetcher);
		for (const h of (Array.isArray(list.hooks) ? list.hooks : []) as { id?: unknown; name?: unknown }[])
			if (typeof h.name === 'string' && h.name.startsWith(HOOK_PREFIX) && typeof h.id === 'number') await shellyRpc(p.url, 'Webhook.Delete', { id: h.id }, password, fetcher);
	} catch {
		/* best effort */
	}
}

// ── An item's plug ─────────────────────────────────────────────────────────────

export type PlugView = Omit<EquipmentPlug, 'passwordEnc' | 'hookToken'> & { hasPassword: boolean; runs: boolean };
const view = ({ passwordEnc, hookToken: _t, ...p }: EquipmentPlug, item?: Pick<Equipment, 'type'>): PlugView => ({ ...p, hasPassword: !!passwordEnc, runs: item?.type === 'doser' });

/** A doser on a plug runs while it has power (#205): its runs are doses, and off between them isn't paused. */
const runsOnPower = (e: Pick<Equipment, 'type'>) => e.type === 'doser';

export function plugOf(equipmentId: string): PlugView | null {
	const r = db.select({ p: equipmentPlugs, e: equipment }).from(equipmentPlugs).innerJoin(equipment, eq(equipment.id, equipmentPlugs.equipmentId)).where(eq(equipmentPlugs.equipmentId, equipmentId)).get();
	return r ? view(r.p, r.e) : null;
}

/** The plugs of a tank's items, by the item's id. */
export function plugsOfTank(tankId: string): Map<string, PlugView> {
	return new Map(
		db
			.select({ p: equipmentPlugs, e: equipment })
			.from(equipmentPlugs)
			.innerJoin(equipment, eq(equipment.id, equipmentPlugs.equipmentId))
			.where(eq(equipmentPlugs.tankId, tankId))
			.all()
			.map((r) => [r.p.equipmentId, view(r.p, r.e)])
	);
}

/**
 * Tie an item to its plug (the owner): the plug must answer. It's set up to
 * report each switch to Waterline (a problem with that is kept, not fatal),
 * and the item follows it from now on: one that runs all the time is paused at
 * once when it's off. A password left blank keeps the one saved before.
 */
export async function linkPlug(
	userId: string,
	equipmentId: string,
	input: { url: string; password: string | null; reportUrl?: string | null },
	fetcher: typeof fetch = fetch
): Promise<PlugView> {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	if (e.removedAt) error(400, 'That equipment was removed');
	const before = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	const password = input.password ?? (before?.url === input.url ? decrypt(before.passwordEnc) : null);
	const name = await plugName(input.url, password, fetcher);
	const state = await readPlug(input.url, password, 0, fetcher);
	const off = await autoOff(input.url, password, 0, fetcher).catch(() => null);
	const at = new Date().toISOString();
	const fields = {
		url: input.url,
		name,
		passwordEnc: password ? encrypt(password) : null,
		switchId: 0,
		on: state.on,
		watts: state.watts,
		lastPolledAt: at,
		lastOkAt: at,
		lastError: null,
		reportUrl: input.reportUrl ?? null,
		autoOffS: off,
		hookToken: before?.hookToken ?? randomBytes(24).toString('hex')
	};
	if (before) db.update(equipmentPlugs).set(fields).where(eq(equipmentPlugs.id, before.id)).run();
	else db.insert(equipmentPlugs).values({ ...fields, equipmentId: e.id, tankId: e.tankId }).run();
	const row = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get()!;
	db.update(equipmentPlugs).set(await installHooks(row, password, fetcher)).where(eq(equipmentPlugs.id, row.id)).run();
	if (!runsOnPower(e)) follow(e.id, state.on, at);
	return plugOf(e.id)!;
}

export async function unlinkPlug(userId: string, equipmentId: string, fetcher: typeof fetch = fetch) {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	if (p) {
		await removeHooks(p, fetcher);
		db.delete(equipmentPlugs).where(eq(equipmentPlugs.id, p.id)).run();
	}
	return e;
}

/** The item and its tank's owner, for what the plug does on its own. */
function itemAndOwner(equipmentId: string) {
	return db
		.select({ e: equipment, owner: users })
		.from(equipment)
		.innerJoin(tanks, eq(tanks.id, equipment.tankId))
		.innerJoin(users, eq(users.id, tanks.userId))
		.where(eq(equipment.id, equipmentId))
		.get();
}

/** An item that runs all the time follows its plug: off, paused (said in History as the plug's doing); on, resumed. */
function follow(equipmentId: string, on: boolean, at: string) {
	const row = itemAndOwner(equipmentId);
	if (!row || row.e.removedAt || runsOnPower(row.e) || !!row.e.pausedAt === !on) return;
	setEquipmentPaused(row.owner.id, equipmentId, !on, row.owner.timeZone, at, { byPlug: true });
}

/** A run of a doser comes to an end: logged as a dose, with how long when it's known. */
function closeRun(p: EquipmentPlug, seconds: number | null) {
	const row = itemAndOwner(p.equipmentId);
	const startedAt = p.runStartedAt;
	db.update(equipmentPlugs).set({ runStartedAt: null, runPlannedS: null }).where(eq(equipmentPlugs.id, p.id)).run();
	if (!row || row.e.removedAt || !startedAt) return null;
	return logPlugRun(row.owner, row.e, startedAt, seconds);
}

/**
 * The plug says it switched (its webhook, #205): the item follows it, and a
 * doser's run starts or ends, logged as a dose once it ends.
 */
export function plugReported(token: string, on: boolean, now = Date.now()) {
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.hookToken, token)).get();
	if (!p) return false;
	const at = new Date(now).toISOString();
	const row = itemAndOwner(p.equipmentId);
	db.update(equipmentPlugs).set({ on, ...(on ? {} : { watts: 0 }) }).where(eq(equipmentPlugs.id, p.id)).run();
	if (!row || !runsOnPower(row.e)) {
		follow(p.equipmentId, on, at);
		return true;
	}
	if (on && !p.runStartedAt) db.update(equipmentPlugs).set({ runStartedAt: at }).where(eq(equipmentPlugs.id, p.id)).run();
	if (!on && p.runStartedAt) closeRun(p, Math.max(0, Math.round((now - Date.parse(p.runStartedAt)) / 1000)));
	return true;
}

/**
 * Switch an item's plug off (pause) or on (resume), from Waterline (the
 * owner). The item changes only once the plug has done it. A doser's plug
 * isn't switched on (that would dose): its schedules on the plug are switched
 * off with Pause, along with the plug, and back on with Resume.
 */
export async function switchPlug(userId: string, equipmentId: string, on: boolean, fetcher: typeof fetch = fetch): Promise<PlugState> {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	if (!p) error(400, 'No plug is linked to it');
	const password = decrypt(p.passwordEnc);
	const at = new Date().toISOString();
	let state: PlugState;
	let pausedScheduleIds = p.pausedScheduleIds;
	try {
		if (runsOnPower(e)) {
			pausedScheduleIds = on ? await enableSchedules(p, password, fetcher) : await disableSchedules(p, password, fetcher);
			if (!on) await shellyRpc(p.url, 'Switch.Set', { id: p.switchId, on: false }, password, fetcher);
			state = await readPlug(p.url, password, p.switchId, fetcher);
		} else {
			await shellyRpc(p.url, 'Switch.Set', { id: p.switchId, on }, password, fetcher);
			state = await readPlug(p.url, password, p.switchId, fetcher);
			if (state.on !== on) throw new PlugError(`The plug stayed ${state.on ? 'on' : 'off'}`);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		db.update(equipmentPlugs).set({ lastPolledAt: at, lastError: msg }).where(eq(equipmentPlugs.id, p.id)).run();
		throw err instanceof PlugError ? err : new PlugError(msg);
	}
	db.update(equipmentPlugs).set({ on: state.on, watts: state.watts, lastPolledAt: at, lastOkAt: at, lastError: null, pausedScheduleIds }).where(eq(equipmentPlugs.id, p.id)).run();
	setEquipmentPaused(userId, e.id, !on, zoneOf(userId), at);
	return state;
}

interface ScheduleJob {
	id: number;
	enable: boolean;
	calls: { method?: string; params?: Record<string, unknown> }[];
}

/** The plug's schedules that switch this switch on (the Shelly app's dosing times). */
async function onSchedules(p: EquipmentPlug, password: string | null, fetcher: typeof fetch): Promise<ScheduleJob[]> {
	const r = await shellyRpc(p.url, 'Schedule.List', {}, password, fetcher);
	const jobs = (Array.isArray(r.jobs) ? r.jobs : []) as ScheduleJob[];
	return jobs.filter(
		(j) =>
			typeof j.id === 'number' &&
			Array.isArray(j.calls) &&
			j.calls.some((c) => /^switch\.(set|toggle)$/i.test(c.method ?? '') && (c.params?.id ?? 0) === p.switchId && c.params?.on !== false)
	);
}

/** Pause a doser: each of its schedules still on is switched off, and their ids kept. */
async function disableSchedules(p: EquipmentPlug, password: string | null, fetcher: typeof fetch): Promise<number[]> {
	const ids = [...p.pausedScheduleIds];
	for (const j of await onSchedules(p, password, fetcher))
		if (j.enable) {
			await shellyRpc(p.url, 'Schedule.Update', { id: j.id, enable: false }, password, fetcher);
			ids.push(j.id);
		}
	return ids;
}

/** Resume a doser: the schedules Pause switched off are switched back on. */
async function enableSchedules(p: EquipmentPlug, password: string | null, fetcher: typeof fetch): Promise<number[]> {
	const known = new Set((await onSchedules(p, password, fetcher)).map((j) => j.id));
	for (const id of p.pausedScheduleIds) if (known.has(id)) await shellyRpc(p.url, 'Schedule.Update', { id, enable: true }, password, fetcher);
	return [];
}

/**
 * Run for… (the owner): the plug on for so many seconds, switching itself off
 * after (its flip-back timer), so it's off on time even if Waterline isn't
 * there. A doser's run is logged as a dose when it ends.
 */
export async function runPlugFor(userId: string, equipmentId: string, seconds: number, fetcher: typeof fetch = fetch) {
	const e = getEquipment(userId, equipmentId);
	requireRoleOn(userId, e.tankId, 'owner');
	if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_RUN_S) error(400, `Run it for 1 second to ${MAX_RUN_S / 60} minutes`);
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.equipmentId, e.id)).get();
	if (!p) error(400, 'No plug is linked to it');
	const at = new Date().toISOString();
	try {
		await shellyRpc(p.url, 'Switch.Set', { id: p.switchId, on: true, toggle_after: seconds }, decrypt(p.passwordEnc), fetcher);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		db.update(equipmentPlugs).set({ lastPolledAt: at, lastError: msg }).where(eq(equipmentPlugs.id, p.id)).run();
		throw err instanceof PlugError ? err : new PlugError(msg);
	}
	db.update(equipmentPlugs)
		.set({ on: true, lastOkAt: at, lastError: null, runPlannedS: seconds, ...(runsOnPower(e) && !p.runStartedAt ? { runStartedAt: at } : {}) })
		.where(eq(equipmentPlugs.id, p.id))
		.run();
	if (!runsOnPower(e)) follow(e.id, true, at);
	return e;
}

const zoneOf = (userId: string) => db.select({ tz: users.timeZone }).from(users).where(eq(users.id, userId)).get()?.tz ?? 'UTC';

/**
 * One plug read: its state kept, and its item following it. A doser's run
 * whose off report didn't come is closed here, at its planned length (Run for…
 * or the plug's auto-off) when one is known.
 */
export async function pollPlug(id: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<{ ok: boolean; error: string | null }> {
	const p = db.select().from(equipmentPlugs).where(eq(equipmentPlugs.id, id)).get();
	if (!p) return { ok: false, error: 'Not found' };
	const at = new Date(now).toISOString();
	try {
		const state = await readPlug(p.url, decrypt(p.passwordEnc), p.switchId, fetcher);
		db.update(equipmentPlugs).set({ on: state.on, watts: state.watts, lastPolledAt: at, lastOkAt: at, lastError: null }).where(eq(equipmentPlugs.id, p.id)).run();
		const item = itemAndOwner(p.equipmentId)?.e;
		if (item && runsOnPower(item)) {
			const planned = p.runPlannedS ?? p.autoOffS;
			if (p.runStartedAt && (!state.on || now - Date.parse(p.runStartedAt) > STALE_RUN_MS)) closeRun(p, planned);
		} else follow(p.equipmentId, state.on, at);
		return { ok: true, error: null };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		db.update(equipmentPlugs).set({ lastPolledAt: at, lastError: msg }).where(eq(equipmentPlugs.id, p.id)).run();
		return { ok: false, error: msg };
	}
}

/** Every plug, one after another: the scheduler's run. Logged once when a plug stops answering. */
export async function pollAllPlugs(fetcher: typeof fetch = fetch, now = Date.now(), budgetMs = 120_000): Promise<void> {
	if (pollingOff()) return;
	const started = Date.now();
	const rows = db
		.select({ id: equipmentPlugs.id, tankId: equipmentPlugs.tankId, lastError: equipmentPlugs.lastError, userId: tanks.userId, archivedAt: tanks.archivedAt, removedAt: equipment.removedAt })
		.from(equipmentPlugs)
		.innerJoin(tanks, eq(tanks.id, equipmentPlugs.tankId))
		.innerJoin(equipment, eq(equipment.id, equipmentPlugs.equipmentId))
		.all();
	for (const row of rows) {
		if (row.archivedAt || row.removedAt) continue;
		// plugs that don't answer can't hold the rest of the run up for long (#211): the others wait for the next one
		if (Date.now() - started > budgetMs) {
			logger.warn('sensors', `Reading smart plugs took over ${Math.round(budgetMs / 60_000)} minutes: the rest wait for the next run`);
			break;
		}
		const r = await pollPlug(row.id, fetcher, now);
		if (!r.ok && !row.lastError) logger.warn('sensors', `A smart plug stopped answering: ${r.error}`, { userId: row.userId, tankId: row.tankId });
		else if (r.ok && row.lastError) logger.info('sensors', 'A smart plug answers again', { userId: row.userId, tankId: row.tankId });
	}
}
