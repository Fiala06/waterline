import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { str } from '$lib/server/forms';
import { addProduct, deleteProduct, lastDosed, listProducts, parseProduct, productHost, updateProduct } from '$lib/server/products';
import type { Actions, PageServerLoad } from './$types';

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
			dosed: dosed.get(p.name.trim().toLowerCase()) ?? null
		})),
		// what's been dosed but has no link yet, to pick from
		suggestions: [...dosed.values()].map((d) => d.name).filter((n) => !saved.has(n.toLowerCase())),
		// "Save a reorder link" on a dosing entry fills the name in
		prefill: (url.searchParams.get('name') ?? '').slice(0, 80),
		// without scripts, "Edit" is a link that opens that product's form
		edit: url.searchParams.get('edit')
	};
};

const values = (form: FormData) => ({ name: str(form, 'name'), url: str(form, 'url'), note: str(form, 'note') });

export const actions: Actions = {
	add: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const { errors, input } = parseProduct(form);
		if (Object.keys(errors).length) return fail(400, { add: { errors, values: values(form) } });
		const p = addProduct(locals.user!.id, input);
		setFlash(cookies, `✓ ${p.name} saved`);
		redirect(303, '/settings/products');
	},
	update: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const id = str(form, 'id');
		const { errors, input } = parseProduct(form);
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
