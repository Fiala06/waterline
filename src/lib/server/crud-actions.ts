// The add / update / delete actions a settings list has (#360: Products,
// Favorites, Test kits): parse the form, turn it back with its errors and what
// was typed, or save it, say so in the toast and go back to the page.
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { User } from './db/schema';
import { setFlash } from './flash';
import { str } from './forms';

interface Crud<I, R, V> {
	/** where each action goes back to */
	page: string;
	parse: (form: FormData, user: User) => { errors: Record<string, string>; input: I };
	/** the form as typed, to fill it again after an error */
	values: (form: FormData) => V;
	add: (userId: string, input: I) => R;
	update: (userId: string, id: string, input: I) => R;
	remove: (userId: string, id: string) => R;
	/** what the toast calls it */
	name: (row: R) => string;
	/** the toast's verbs: "✓ Easy Green saved", "Easy Green deleted" */
	verbs?: { add?: string; update?: string; remove?: string };
}

export function crudActions<I, R, V>(c: Crud<I, R, V>) {
	const verb = { add: 'saved', update: 'saved', remove: 'deleted', ...c.verbs };
	return {
		add: async ({ request, locals, cookies }: RequestEvent) => {
			const form = await request.formData();
			const { errors, input } = c.parse(form, locals.user!);
			if (Object.keys(errors).length) return fail(400, { add: { errors, values: c.values(form) } });
			setFlash(cookies, `✓ ${c.name(c.add(locals.user!.id, input))} ${verb.add}`);
			redirect(303, c.page);
		},
		update: async ({ request, locals, cookies }: RequestEvent) => {
			const form = await request.formData();
			const id = str(form, 'id');
			const { errors, input } = c.parse(form, locals.user!);
			if (Object.keys(errors).length) return fail(400, { edit: { id, errors, values: c.values(form) } });
			setFlash(cookies, `✓ ${c.name(c.update(locals.user!.id, id, input))} ${verb.update}`);
			redirect(303, c.page);
		},
		delete: async ({ request, locals, cookies }: RequestEvent) => {
			const id = str(await request.formData(), 'id');
			setFlash(cookies, `${c.name(c.remove(locals.user!.id, id))} ${verb.remove}`);
			redirect(303, c.page);
		}
	};
}
