// Settings › Sensors & controllers (#19): tokens that let a probe, ESPHome,
// Node-RED or Home Assistant post readings to a tank, devices Waterline reads
// itself from their own web page, and what has come in.
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { createAssistantToken, listAssistantTokens, MAX_TOKENS, revokeAssistantToken, setTokenTanks } from '$lib/server/assistant/tokens';
import { createDevicePoll, type DeviceAuth, discoverEsphome, guessParameter, listDevicePolls, MAX_DEVICES, parseDeviceUrl, pollDevice, pollingOff, removeDevicePoll } from '$lib/server/devices';
import { decrypt, encrypt } from '$lib/server/secrets';
import { latestSamples, MIN_GAP_MS, sampleCounts } from '$lib/server/sensors';
import { listParams, listTanks } from '$lib/server/tanks';
import type { PolledSensor } from '$lib/server/db/schema';
import { fmtWhen } from '$lib/time';
import { fmtValue, paramUnit } from '$lib/params';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const tanks = listTanks(user.id, { own: true }).map((t) => ({ id: t.id, name: t.name }));
	const names = new Map(tanks.map((t) => [t.id, t.name]));
	// newest first
	const tokens = listAssistantTokens(user.id, 'sensor').map((t) => ({
		id: t.id,
		name: t.name,
		hint: t.hint,
		createdAt: t.createdAt,
		lastUsedAt: t.lastUsedAt,
		tankIds: t.tankIds.filter((id) => names.has(id)),
		tankNames: t.tankIds.flatMap((id) => names.get(id) ?? [])
	}));
	// the tank the examples carry: the one asked for (?for=), else the newest token's
	// first tank, else the first tank; the first in the list alone sent readings to the
	// wrong tank when the token was for another
	const asked = url.searchParams.get('for');
	const exampleTank = tanks.find((t) => t.id === asked)?.id ?? tokens.find((t) => t.tankIds.length)?.tankIds[0] ?? tanks[0]?.id ?? null;
	return {
		tanks,
		tokens,
		exampleTank,
		// devices Waterline reads itself, newest first, with how each is doing
		polling: !pollingOff(),
		devices: listDevicePolls(user.id).map((d) => {
			const byLabel = new Map(listParams(d.tankId, { all: true }).map((p) => [p.key === 'custom' ? p.name : p.key, p.name]));
			const when = d.lastPolledAt ? fmtWhen(d.lastPolledAt, user.timeZone) : null;
			return {
				id: d.id,
				name: d.name,
				url: d.url,
				tankName: names.get(d.tankId) ?? '',
				reads: d.sensors.map((s) => `${s.name} → ${byLabel.get(s.parameter) ?? s.parameter}`).join(' · '),
				status: d.lastError ? `✕ ${d.lastError}${when ? ` · tried ${when}` : ''}` : when ? `✓ OK · read ${when}` : '– Not read yet',
				level: d.lastError ? 'bad' : when ? 'ok' : 'muted'
			};
		}),
		// what each tank has heard from its sensors: the latest sample per parameter
		incoming: tanks.map((t) => {
			const latest = latestSamples(t.id);
			const params = listParams(t.id, { all: true });
			const c = sampleCounts(t.id);
			return {
				id: t.id,
				name: t.name,
				count: c.count,
				since: c.first ? fmtWhen(c.first, user.timeZone) : null,
				sources: c.sources,
				latest: params.flatMap((p) => {
					const s = latest.get(p.id);
					return s ? [{ name: p.name, key: p.key === 'custom' ? p.name : p.key, value: `${fmtValue(p, s.value, user)}${paramUnit(p, user) ? ` ${paramUnit(p, user)}` : ''}`, at: fmtWhen(s.at, user.timeZone), source: s.source }] : [];
				})
			};
		}),
		apiUrl: `${(env.ORIGIN || url.origin).replace(/\/+$/, '')}/api/v1`,
		minGapSeconds: MIN_GAP_MS / 1000,
		edit: url.searchParams.get('edit')
	};
};

const picked = (form: FormData) => form.getAll('tank').map(String);

const paramLabel = (p: { key: string; name: string }) => (p.key === 'custom' ? p.name : p.key);
const isObjectId = (s: string) => /^[a-z0-9_]+$/i.test(s);

/** What the device's sensors look like on the page: what was found, each with the parameter guessed or chosen for it. */
type FoundSensor = { objectId: string; name: string; state: string; value: number | null; unit: string | null; guess: string | null; checked: boolean };

/** The found list again from what the form carried, when adding fails, so nothing picked is lost. */
function foundFromForm(form: FormData, tank: { id: string; name: string }, url: string) {
	const ticked = new Set(form.getAll('sensor').map(String));
	const sensors: FoundSensor[] = form
		.getAll('all')
		.map(String)
		.filter(isObjectId)
		.map((objectId) => {
			const state = str(form, `state-${objectId}`);
			const value = parseFloat(state);
			return {
				objectId,
				name: str(form, `name-${objectId}`) || objectId,
				state,
				value: Number.isFinite(value) ? value : null,
				unit: str(form, `unit-${objectId}`) || null,
				guess: str(form, `param-${objectId}`) || null,
				checked: ticked.has(objectId)
			};
		});
	return {
		tankId: tank.id,
		tankName: tank.name,
		url,
		title: str(form, 'title') || null,
		auth: str(form, 'auth'),
		name: str(form, 'name'),
		params: listParams(tank.id).map((p) => ({ label: paramLabel(p), name: p.name })),
		sensors
	};
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 60);
		const tankIds = picked(form);
		const errors: Record<string, string> = {};
		if (!name) errors.name = 'Name the device, e.g. Apex or ESPHome.';
		if (!tankIds.length) errors.tanks = 'Pick at least one tank.';
		if (listAssistantTokens(user.id, 'sensor').length >= MAX_TOKENS) errors.name = `That's ${MAX_TOKENS} already: revoke one you don't use first.`;
		if (Object.keys(errors).length) return fail(400, { create: { errors, name, tankIds } });
		const { token, row } = createAssistantToken(user.id, name, tankIds, 'sensor');
		logger.info('assistant', `Sensor token "${row.name}" made`, { userId: user.id });
		return { created: { id: row.id, name: row.name, token, tankId: row.tankIds[0] ?? '' } };
	},
	tanks: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		const tankIds = picked(form);
		if (!tankIds.length) return fail(400, { edit: { id, errors: { tanks: 'Pick at least one tank, or revoke it.' } } });
		const row = setTokenTanks(locals.user!.id, id, tankIds);
		if (row) setFlash(cookies, `✓ ${row.name} saved`);
		redirect(303, '/settings/sensors');
	},
	revoke: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const row = revokeAssistantToken(locals.user!.id, str(form, 'id'));
		if (row) {
			logger.info('assistant', `Sensor token "${row.name}" revoked`, { userId: locals.user!.id });
			setFlash(cookies, `${row.name} can't send readings any more`);
		}
		redirect(303, '/settings/sensors');
	},

	// ── Devices read from their own web page ──────────────────────────────
	/** Step one: listen to the device for its sensors, and show them with a parameter guessed for each. */
	find: async ({ request, locals }) => {
		const user = locals.user!;
		if (pollingOff()) redirect(303, '/settings/sensors');
		const form = await request.formData();
		const raw = str(form, 'url').slice(0, 200);
		const tankId = str(form, 'tank');
		const username = str(form, 'username').slice(0, 100);
		const password = String(form.get('password') ?? '').slice(0, 200);
		const back = { url: raw, tankId, username };
		const errors: Record<string, string> = {};
		const url = parseDeviceUrl(raw);
		const tank = listTanks(user.id, { own: true }).find((t) => t.id === tankId);
		if (!url) errors.url = raw ? 'An address like 192.168.1.33 or http://probe.local, nothing more.' : "The device's address, like 192.168.1.33.";
		if (!tank) errors.tank = 'Pick the tank it reads into.';
		if (listDevicePolls(user.id).length >= MAX_DEVICES) errors.url = `That's ${MAX_DEVICES} devices already: remove one you don't read first.`;
		if (Object.keys(errors).length || !url || !tank) return fail(400, { find: { errors, ...back } });
		const auth: DeviceAuth | null = username ? { username, password } : null;
		let found: Awaited<ReturnType<typeof discoverEsphome>>;
		try {
			found = await discoverEsphome(url, auth);
		} catch (e) {
			return fail(400, { find: { errors: { url: e instanceof Error ? e.message : String(e) }, ...back } });
		}
		if (!found.sensors.length) return fail(400, { find: { errors: { url: `${found.title ?? 'The device'} answered, but reports no sensors.` }, ...back } });
		const params = listParams(tank.id);
		logger.info('sensors', `Found ${found.sensors.length} sensor${found.sensors.length === 1 ? '' : 's'} on ${url}`, { userId: user.id, tankId });
		return {
			found: {
				tankId,
				tankName: tank.name,
				url,
				title: found.title,
				// the sign-in rides along sealed, never in the page in clear
				auth: auth ? encrypt(JSON.stringify(auth)) : '',
				name: found.title ?? new URL(url).hostname,
				params: params.map((p) => ({ label: paramLabel(p), name: p.name })),
				sensors: found.sensors.map((s): FoundSensor => {
					const guess = guessParameter(s, params);
					return { ...s, guess, checked: !!guess && s.value != null };
				})
			}
		};
	},
	/** Step two: keep the device with the sensors ticked, and read it once straight away. */
	addDevice: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		if (pollingOff()) redirect(303, '/settings/sensors');
		const form = await request.formData();
		const tankId = str(form, 'tank');
		const url = parseDeviceUrl(str(form, 'url'));
		const name = str(form, 'name').slice(0, 60);
		const tank = listTanks(user.id, { own: true }).find((t) => t.id === tankId);
		if (!tank || !url) return fail(400, { find: { errors: { url: 'Find the device again.' }, url: '', tankId, username: '' } });
		let auth: DeviceAuth | null = null;
		const sealed = str(form, 'auth');
		if (sealed) {
			try {
				const j = JSON.parse(decrypt(sealed) ?? 'null');
				if (j && typeof j.username === 'string' && typeof j.password === 'string') auth = { username: j.username, password: j.password };
			} catch {
				auth = null;
			}
		}
		const sensors: PolledSensor[] = form
			.getAll('sensor')
			.map(String)
			.filter(isObjectId)
			.map((objectId) => ({ objectId, name: (str(form, `name-${objectId}`) || objectId).slice(0, 80), parameter: str(form, `param-${objectId}`).slice(0, 80), unit: str(form, `unit-${objectId}`).slice(0, 20) || null }));
		const errors: Record<string, string> = {};
		const labels = new Set(listParams(tank.id, { all: true }).map(paramLabel));
		if (!name) errors.name = "Name the device: it's shown as the readings' source.";
		if (!sensors.length) errors.sensors = 'Tick at least one sensor.';
		else if (sensors.some((s) => !labels.has(s.parameter))) errors.sensors = 'Pick which parameter each ticked sensor is.';
		if (listDevicePolls(user.id).length >= MAX_DEVICES) errors.sensors = `That's ${MAX_DEVICES} devices already: remove one you don't read first.`;
		if (Object.keys(errors).length) return fail(400, { found: foundFromForm(form, tank, url), add: { errors } });
		const row = createDevicePoll(user.id, { tankId, name, url, sensors, auth });
		const first = await pollDevice(row.id);
		logger.info('sensors', `Reading ${row.name} at ${url}: ${sensors.length} sensor${sensors.length === 1 ? '' : 's'}`, { userId: user.id, tankId });
		setFlash(cookies, first.ok ? `✓ ${row.name} added · ${first.stored} reading${first.stored === 1 ? '' : 's'} in` : `▲ ${row.name} added, but it couldn't be read: ${first.error}`);
		redirect(303, '/settings/sensors');
	},
	pollNow: async ({ request, locals, cookies }) => {
		if (pollingOff()) redirect(303, '/settings/sensors');
		const form = await request.formData();
		const id = str(form, 'id');
		const row = listDevicePolls(locals.user!.id).find((d) => d.id === id);
		if (row) {
			const r = await pollDevice(row.id);
			setFlash(cookies, r.ok ? `✓ ${row.name} read · ${r.stored} reading${r.stored === 1 ? '' : 's'} in` : `✕ ${row.name}: ${r.error}`);
		}
		redirect(303, '/settings/sensors');
	},
	removeDevice: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const row = removeDevicePoll(locals.user!.id, str(form, 'id'));
		if (row) {
			logger.info('sensors', `Stopped reading ${row.name}`, { userId: locals.user!.id });
			setFlash(cookies, `${row.name} isn't read any more`);
		}
		redirect(303, '/settings/sensors');
	}
};
