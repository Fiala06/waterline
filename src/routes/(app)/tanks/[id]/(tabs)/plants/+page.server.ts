import { fail, redirect } from '@sveltejs/kit';
import { dateInZone, fmtDate } from '$lib/time';
import { setFlash } from '$lib/server/flash';
import { optStr, str } from '$lib/server/forms';
import { addPlant, getPlant, listPlants, logTrim, removePlant, updatePlant } from '$lib/server/specs';
import type { Actions, PageServerLoad } from './$types';

const POSITIONS = ['background', 'midground', 'foreground', 'epiphyte'] as const;
const STATUSES = ['thriving', 'melting', 'algae', 'other'] as const;
const pick = <T extends string>(v: string, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export const load: PageServerLoad = ({ locals, params }) => {
	const user = locals.user!;
	return {
		plants: listPlants(user.id, params.id).map((p) => ({
			id: p.id,
			name: p.name,
			scientific: p.scientificName,
			position: p.position,
			status: p.status,
			trimmed: p.lastTrimmedAt ? fmtDate(dateInZone(p.lastTrimmedAt, user.timeZone)) : null
		}))
	};
};

export const actions: Actions = {
	add: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 80);
		if (!name) return fail(400, { error: 'Enter the plant.' });
		const p = addPlant(locals.user!.id, params.id, {
			name,
			scientificName: optStr(form, 'scientificName', 120),
			position: pick(str(form, 'position'), POSITIONS, 'midground'),
			status: pick(str(form, 'status'), STATUSES, 'thriving')
		});
		setFlash(cookies, `✓ ${p.name} added`);
		redirect(303, `/tanks/${params.id}/plants`);
	},
	update: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		if (getPlant(locals.user!.id, id).tankId !== params.id) return fail(404);
		updatePlant(locals.user!.id, id, {
			position: pick(str(form, 'position'), POSITIONS, 'midground'),
			status: pick(str(form, 'status'), STATUSES, 'thriving')
		});
		setFlash(cookies, '✓ Plant saved');
		redirect(303, `/tanks/${params.id}/plants`);
	},
	remove: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const p = removePlant(locals.user!.id, str(form, 'id'));
		setFlash(cookies, `${p.name} removed`);
		redirect(303, `/tanks/${params.id}/plants`);
	},
	trim: async ({ request, locals, params, cookies }) => {
		const form = await request.formData();
		const ids = form.getAll('plant').map(String);
		if (!ids.length) return fail(400, { error: 'Choose the plants you trimmed.' });
		logTrim(locals.user!.id, params.id, ids, optStr(form, 'note'));
		setFlash(cookies, `✓ Trim logged · ${ids.length} plant${ids.length === 1 ? '' : 's'}`);
		redirect(303, `/tanks/${params.id}/plants`);
	}
};
