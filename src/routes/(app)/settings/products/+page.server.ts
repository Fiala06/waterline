import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { addProduct, deleteProduct, lastDosed, listProducts, parseProduct, productHost, updateProduct } from '$lib/server/products';
import { formatNumber, toDisplay, unitLabel, type UnitPrefs } from '$lib/units';
import type { Actions, PageServerLoad } from './$types';

/** A saved strength back as the form takes it: 1 mL in 10 L (or gal) adds this many ppm. */
function strengthFields(mgPerMl: number | null, of: string | null, prefs: UnitPrefs) {
	if (mgPerMl == null) return { strengthDose: '', strengthPer: '', strengthPpm: '', strengthOf: of ?? '' };
	const per = prefs.unitSystem === 'imperial' ? 10 : 10; // 10 of the keeper's unit
	const perL = per / toDisplay(1, 'volume', prefs);
	return { strengthDose: '1', strengthPer: String(per), strengthPpm: formatNumber(mgPerMl / perL, 3), strengthOf: of ?? '' };
}

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const dosed = lastDosed(user.id, user.timeZone);
	const list = listProducts(user.id);
	const saved = new Set(list.map((p) => p.name.trim().toLowerCase()));
	return {
		products: list.map((p) => ({
			id: p.id,
			name: p.name,
			url: p.url,
			note: p.note,
			host: productHost(p.url),
			dosed: dosed.get(p.name.trim().toLowerCase()) ?? null,
			// "1 mL in 10 L adds 1 ppm of nitrate", for the list and the Dose → ppm calculator (#18)
			strength: p.strengthMgPerMl != null ? `${strengthFields(p.strengthMgPerMl, p.strengthOf, user).strengthPpm} ppm${p.strengthOf ? ` of ${p.strengthOf}` : ''} per mL in 10 ${unitLabel('volume', user)}` : null,
			...strengthFields(p.strengthMgPerMl, p.strengthOf, user)
		})),
		volUnit: unitLabel('volume', user),
		// what's been dosed but has no link yet, to pick from
		suggestions: [...dosed.values()].map((d) => d.name).filter((n) => !saved.has(n.toLowerCase())),
		// "Save a reorder link" on a dosing entry fills the name in
		prefill: (url.searchParams.get('name') ?? '').slice(0, 80),
		// without scripts, "Edit" is a link that opens that product's form
		edit: url.searchParams.get('edit')
	};
};

const values = (form: FormData) => ({
	name: str(form, 'name'),
	url: str(form, 'url'),
	note: str(form, 'note'),
	strengthDose: str(form, 'strengthDose'),
	strengthPer: str(form, 'strengthPer'),
	strengthPpm: str(form, 'strengthPpm'),
	strengthOf: str(form, 'strengthOf')
});

export const actions: Actions = {
	add: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const { errors, input } = parseProduct(form, locals.user!);
		if (Object.keys(errors).length) return fail(400, { add: { errors, values: values(form) } });
		const p = addProduct(locals.user!.id, input);
		setFlash(cookies, `✓ ${p.name} saved`);
		redirect(303, '/settings/products');
	},
	update: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		const { errors, input } = parseProduct(form, locals.user!);
		if (Object.keys(errors).length) return fail(400, { edit: { id, errors, values: values(form) } });
		const p = updateProduct(locals.user!.id, id, input);
		setFlash(cookies, `✓ ${p.name} saved`);
		redirect(303, '/settings/products');
	},
	delete: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const p = deleteProduct(locals.user!.id, str(form, 'id'));
		setFlash(cookies, `${p.name} deleted`);
		redirect(303, '/settings/products');
	}
};
