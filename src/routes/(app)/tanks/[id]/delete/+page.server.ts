// Delete a tank for good (#304): an archived tank's owner only. What goes, a
// backup first, then the tank's name typed out.
import { isHttpError, redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { refuse, str } from '$lib/server/forms';
import { deleteTank, tankFootprint } from '$lib/server/tank-delete';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => ({ footprint: tankFootprint(locals.user!.id, params.id) });

export const actions: Actions = {
	default: async ({ request, locals, params, cookies }) => {
		const user = locals.user!;
		const { tank } = tankFootprint(user.id, params.id);
		const typed = str(await request.formData(), 'name');
		if (typed.trim() !== tank.name.trim()) return refuse('delete', 'Type the tank’s name exactly as it is shown.', { name: typed });
		let name: string;
		try {
			name = await deleteTank(user, params.id);
		} catch (e) {
			if (isHttpError(e) && e.status === 409) return refuse('delete', e.body.message, { name: typed }, 409);
			throw e;
		}
		// it was the tank picked: the next one is chosen afresh
		if (cookies.get('wl_tank') === params.id) cookies.delete('wl_tank', { path: '/' });
		setFlash(cookies, `${name} deleted`);
		redirect(303, '/tanks');
	}
};
