// Settings › Sensors & controllers (#19): tokens that let a probe, ESPHome,
// Node-RED or Home Assistant post readings to a tank, and what has come in.
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { logger } from '$lib/server/log';
import { createAssistantToken, listAssistantTokens, MAX_TOKENS, revokeAssistantToken, setTokenTanks } from '$lib/server/assistant/tokens';
import { latestSamples, MIN_GAP_MS, sampleCounts } from '$lib/server/sensors';
import { listParams, listTanks } from '$lib/server/tanks';
import { fmtWhen } from '$lib/time';
import { fmtValue, paramUnit } from '$lib/params';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const tanks = listTanks(user.id, { own: true }).map((t) => ({ id: t.id, name: t.name }));
	const names = new Map(tanks.map((t) => [t.id, t.name]));
	return {
		tanks,
		tokens: listAssistantTokens(user.id, 'sensor').map((t) => ({
			id: t.id,
			name: t.name,
			hint: t.hint,
			createdAt: t.createdAt,
			lastUsedAt: t.lastUsedAt,
			tankIds: t.tankIds.filter((id) => names.has(id)),
			tankNames: t.tankIds.flatMap((id) => names.get(id) ?? [])
		})),
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
	}
};
