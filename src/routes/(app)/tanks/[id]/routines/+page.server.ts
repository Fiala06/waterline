import { fail, redirect } from '@sveltejs/kit';
import { FAVORITE_KIND_LABEL } from '$lib/favorites';
import { stepSub } from '$lib/routines';
import { setFlash } from '$lib/server/flash';
import { listFavorites } from '$lib/server/favorites';
import { str } from '$lib/server/forms';
import { addRoutine, addStep, deleteRoutine, getRoutine, listRoutines, moveStep, parseStep, removeStep, renameRoutine, stepsOf } from '$lib/server/routines';
import { getTank } from '$lib/server/tanks';
import { unitLabel } from '$lib/units';
import type { Actions, PageServerLoad } from './$types';

// Maintenance routines (#92): a tank's named step sequences, built a step at a
// time (or from the keeper's Quick log favorites), each run from here.

export const load: PageServerLoad = ({ locals, params, url }) => {
	const user = locals.user!;
	const tank = getTank(user.id, params.id, 'log');
	const volUnit = unitLabel('volume', user);
	return {
		tank: { id: tank.id, name: tank.name },
		volUnit,
		routines: listRoutines(tank.id).map((r) => {
			const steps = stepsOf(r);
			return {
				id: r.id,
				name: r.name,
				steps: steps.map((s, i) => ({ i, label: s.label, kind: s.kind, kindLabel: FAVORITE_KIND_LABEL[s.kind], sub: stepSub(s, volUnit), first: i === 0, last: i === steps.length - 1 }))
			};
		}),
		// the keeper's favorites for this tank or every tank: one tap to add one as a step
		favorites: listFavorites(user.id)
			.filter((f) => !f.tankId || f.tankId === tank.id)
			.map((f) => ({ id: f.id, label: f.label })),
		// without scripts, "Add a step" is a link that opens that routine's form
		open: url.searchParams.get('add')
	};
};

const stepValues = (form: FormData) => ({
	label: str(form, 'label'),
	kind: str(form, 'kind'),
	amountMode: str(form, 'amountMode') || 'percent',
	amount: str(form, 'wcAmount') || str(form, 'doseAmount') || str(form, 'feedAmount'),
	source: str(form, 'source') || 'tap',
	product: str(form, 'product'),
	unit: str(form, 'doseUnit') || str(form, 'feedUnit'),
	food: str(form, 'food'),
	actions: form.getAll('actions').map(String)
});

export const actions: Actions = {
	add: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const name = str((await request.formData()), 'name').slice(0, 60);
		if (!name) return fail(400, { add: { error: 'Name the routine, like Sunday maintenance.' } });
		const r = addRoutine(tank.id, name);
		setFlash(cookies, `✓ ${r.name} added · now add its steps`);
		redirect(303, `/tanks/${tank.id}/routines?add=${r.id}#r-${r.id}`);
	},
	rename: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const form = await request.formData();
		const name = str(form, 'name').slice(0, 60);
		if (!name) return fail(400, { rename: { id: str(form, 'id'), error: 'Name the routine.' } });
		renameRoutine(tank.id, str(form, 'id'), name);
		setFlash(cookies, '✓ Renamed');
		redirect(303, `/tanks/${tank.id}/routines`);
	},
	delete: async ({ request, locals, params, cookies }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const r = deleteRoutine(tank.id, str(await request.formData(), 'id'));
		setFlash(cookies, `${r.name} deleted`);
		redirect(303, `/tanks/${tank.id}/routines`);
	},
	addStep: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const id = str(form, 'id');
		const { errors, step } = parseStep(form, unitLabel('volume', user));
		if (Object.keys(errors).length) return fail(400, { step: { id, errors, values: stepValues(form) } });
		const r = addStep(tank.id, id, step);
		if (r) return fail(400, { step: { id, errors: { kind: r.error }, values: stepValues(form) } });
		setFlash(cookies, `✓ ${step.label} added`);
		redirect(303, `/tanks/${tank.id}/routines?add=${id}#r-${id}`);
	},
	// a Quick log favorite as a step, in one tap
	addFavorite: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const tank = getTank(user.id, params.id, 'log');
		const form = await request.formData();
		const id = str(form, 'id');
		const f = listFavorites(user.id).find((x) => x.id === str(form, 'favorite') && (!x.tankId || x.tankId === tank.id));
		if (!f) return fail(400, { step: { id, errors: { kind: 'That favorite is gone.' }, values: null } });
		const r = addStep(tank.id, id, { kind: f.kind, label: f.label, fields: f.fields });
		if (r) return fail(400, { step: { id, errors: { kind: r.error }, values: null } });
		setFlash(cookies, `✓ ${f.label} added`);
		redirect(303, `/tanks/${tank.id}/routines?add=${id}#r-${id}`);
	},
	removeStep: async ({ request, locals, params }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const form = await request.formData();
		removeStep(tank.id, str(form, 'id'), Number(str(form, 'index')));
		redirect(303, `/tanks/${tank.id}/routines`);
	},
	moveStep: async ({ request, locals, params }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const form = await request.formData();
		moveStep(tank.id, str(form, 'id'), Number(str(form, 'index')), str(form, 'dir') === 'up' ? 'up' : 'down');
		redirect(303, `/tanks/${tank.id}/routines`);
	},
	// Run: nothing to save; the run page takes it from here
	run: async ({ request, locals, params }) => {
		const tank = getTank(locals.user!.id, params.id, 'log');
		const r = getRoutine(tank.id, str(await request.formData(), 'id'));
		redirect(303, `/tanks/${tank.id}/routines/${r.id}/run`);
	}
};
