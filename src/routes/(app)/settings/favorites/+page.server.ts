import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { addFavorite, deleteFavorite, formAmount, formUnit, listFavorites, moveFavorite, parseFavorite, updateFavorite } from '$lib/server/favorites';
import { listTanks } from '$lib/server/tanks';
import { listTasks } from '$lib/server/tasks';
import { favoriteDefaultLabel, favoriteSub, FAVORITE_KIND_LABEL, isFavoriteKind, type FavoriteKind } from '$lib/favorites';
import { unitLabel } from '$lib/units';
import type { Actions, PageServerLoad } from './$types';

/** A saved favorite's fields back as the form takes them. */
function formValues(f: { label: string; tankId: string | null; kind: FavoriteKind; fields: Record<string, string | string[]> }) {
	const s = (k: string) => (typeof f.fields[k] === 'string' ? (f.fields[k] as string) : '');
	return {
		label: f.label,
		tank: f.tankId ?? '',
		kind: f.kind,
		amountMode: s('amountMode') || 'percent',
		amount: s('amount'),
		source: s('source') || 'tap',
		product: s('product'),
		unit: s('unit'),
		food: s('food'),
		actions: Array.isArray(f.fields.actions) ? (f.fields.actions as string[]) : []
	};
}

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const volUnit = unitLabel('volume', user);
	const tanks = listTanks(user.id).map((t) => ({ id: t.id, name: t.name }));
	const nameOf = (id: string | null) => (id ? (tanks.find((t) => t.id === id)?.name ?? 'A tank') : 'Every tank');
	const list = listFavorites(user.id);
	// routines that dose or feed something: one tap to pin as a favorite too
	const have = new Set(list.map((f) => `${f.tankId ?? ''}:${f.kind}:${String(f.fields.product ?? f.fields.food ?? '').toLowerCase()}`));
	const suggestions = listTasks(user.id)
		.filter((r) => (r.task.kind === 'dosing' || r.task.kind === 'feeding') && r.task.product)
		.map((r) => {
			const kind = r.task.kind as 'dosing' | 'feeding';
			const fields: Record<string, string> = kind === 'dosing' ? { product: r.task.product! } : { food: r.task.product! };
			if (r.task.amount != null) fields.amount = String(r.task.amount);
			if (r.task.amountUnit) fields.unit = r.task.amountUnit;
			// the add form's field names for this kind, for the one-tap Pin
			const inputs: Record<string, string> = { kind, tank: r.task.tankId, ...(kind === 'dosing' ? { product: fields.product } : { food: fields.food }) };
			if (fields.amount) inputs[kind === 'dosing' ? 'doseAmount' : 'feedAmount'] = fields.amount;
			if (fields.unit) inputs[kind === 'dosing' ? 'doseUnit' : 'feedUnit'] = fields.unit;
			return { tankId: r.task.tankId, tank: r.tankName, kind, fields, inputs, label: favoriteDefaultLabel(kind, fields, volUnit) };
		})
		.filter((s) => !have.has(`${s.tankId}:${s.kind}:${(s.fields.product ?? s.fields.food ?? '').toLowerCase()}`));
	return {
		favorites: list.map((f, i) => ({
			id: f.id,
			kindLabel: FAVORITE_KIND_LABEL[f.kind],
			sub: favoriteSub(f.kind, f.fields, volUnit),
			tankName: nameOf(f.tankId),
			first: i === 0,
			last: i === list.length - 1,
			...formValues(f)
		})),
		tanks,
		volUnit,
		suggestions,
		// without scripts, "Edit" is a link that opens that favorite's form
		edit: url.searchParams.get('edit')
	};
};

const values = (form: FormData) => {
	const k = str(form, 'kind');
	const kind: FavoriteKind = isFavoriteKind(k) ? k : 'test';
	return {
		label: str(form, 'label'),
		tank: str(form, 'tank'),
		kind: k,
		amountMode: str(form, 'amountMode') || 'percent',
		amount: formAmount(form, kind),
		source: str(form, 'source') || 'tap',
		product: str(form, 'product'),
		unit: formUnit(form, kind),
		food: str(form, 'food'),
		actions: form.getAll('actions').map(String)
	};
};

export const actions: Actions = {
	add: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const { errors, input } = parseFavorite(form, listTanks(user.id).map((t) => t.id), unitLabel('volume', user));
		if (Object.keys(errors).length) return fail(400, { add: { errors, values: values(form) } });
		const f = addFavorite(user.id, input);
		setFlash(cookies, `✓ ${f.label} pinned`);
		redirect(303, '/settings/favorites');
	},
	update: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = str(form, 'id');
		const { errors, input } = parseFavorite(form, listTanks(user.id).map((t) => t.id), unitLabel('volume', user));
		if (Object.keys(errors).length) return fail(400, { edit: { id, errors, values: values(form) } });
		const f = updateFavorite(user.id, id, input);
		setFlash(cookies, `✓ ${f.label} saved`);
		redirect(303, '/settings/favorites');
	},
	delete: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const f = deleteFavorite(locals.user!.id, str(form, 'id'));
		setFlash(cookies, `${f.label} removed`);
		redirect(303, '/settings/favorites');
	},
	move: async ({ request, locals }) => {
		const form = await request.formData();
		moveFavorite(locals.user!.id, str(form, 'id'), str(form, 'dir') === 'up' ? 'up' : 'down');
		redirect(303, '/settings/favorites');
	}
};
